import Toybox.Cryptography;
import Toybox.Lang;

//! The control channel's cryptography on the watch (docs/dev/decisions/004-control-channel.md):
//! the keys HKDF-SHA256 derives from the secret S, and the envelopes, AES-256-CBC then a
//! 16-byte HMAC-SHA256 tag over the version, the direction, the run, the counter, the
//! time, the IV and the ciphertext. protocol/channel-vectors.json holds what it must
//! produce byte for byte; ChannelTest.mc checks it in the simulator.
module ChannelCrypto {
    const VERSION = 1;
    const SALT = "wristmark/channel/v1";
    const TO_WATCH = 1;
    const TO_VIEWER = 2;
    //! How far an envelope's clock may be from ours, in seconds.
    const SKEW = 120;
    //! Whether Cipher pads by itself in CBC mode: Garmin's documentation doesn't say, and
    //! the spike on the watch settles it. False: the data is padded here (PKCS#7) and
    //! Cipher gets whole blocks.
    const CIPHER_PADS = false;

    function hmac(key as ByteArray, data as ByteArray) as ByteArray {
        var mac = new Cryptography.HashBasedMessageAuthenticationCode({
            :algorithm => Cryptography.HASH_SHA256,
            :key => key,
        });
        mac.update(data);
        return mac.digest();
    }

    function sha256(data as ByteArray) as ByteArray {
        var hash = new Cryptography.Hash({ :algorithm => Cryptography.HASH_SHA256 });
        hash.update(data);
        return hash.digest();
    }

    //! HKDF-SHA256 (RFC 5869) of S: `length` bytes (at most 64) for `info`.
    function hkdf(secret as ByteArray, info as String, length as Number) as ByteArray {
        var prk = hmac(Bytes.fromText(SALT), secret);
        var out = []b;
        var previous = []b;
        for (var i = 1; out.size() < length; i++) {
            var block = previous.slice(0, null);
            block.addAll(Bytes.fromText(info));
            block.add(i);
            previous = hmac(prk, block);
            out.addAll(previous);
        }
        return out.slice(0, length);
    }

    //! A session's keys and names from S (16 bytes): {:id, :watchToken, :viewerToken,
    //! :toWatchEnc, :toWatchMac, :toViewerEnc, :toViewerMac}.
    function derive(secret as ByteArray) as Dictionary {
        return {
            :id => Bytes.toBase64Url(hkdf(secret, "id", 16)),
            :watchToken => Bytes.toBase64Url(hkdf(secret, "token/watch", 32)),
            :viewerToken => Bytes.toBase64Url(hkdf(secret, "token/viewer", 32)),
            :toWatchEnc => hkdf(secret, "to-watch/enc", 32),
            :toWatchMac => hkdf(secret, "to-watch/mac", 32),
            :toViewerEnc => hkdf(secret, "to-viewer/enc", 32),
            :toViewerMac => hkdf(secret, "to-viewer/mac", 32),
        };
    }

    //! The SHA-256 of a token's text, in hex: what the relay keeps.
    function tokenHash(token as String) as String {
        return Bytes.toHex(sha256(Bytes.fromText(token)));
    }

    function tag(macKey as ByteArray, direction as Number, r as ByteArray, s as Number, ts as Number,
            iv as ByteArray, c as ByteArray) as ByteArray {
        var data = new [2]b;
        data[0] = VERSION;
        data[1] = direction;
        data.addAll(r);
        data.addAll(Bytes.uint32(s));
        data.addAll(Bytes.uint32(ts));
        data.addAll(iv);
        data.addAll(c);
        return hmac(macKey, data).slice(0, 16);
    }

    function cipher(key as ByteArray, iv as ByteArray) as Cryptography.Cipher {
        return new Cryptography.Cipher({
            :algorithm => Cryptography.CIPHER_AES256,
            :mode => Cryptography.MODE_CBC,
            :key => key,
            :iv => iv,
        });
    }

    //! The envelope of `plain` (the message's compact JSON) toward the viewer: the
    //! watch only ever seals in that direction. `iv` random unless given (the tests).
    function seal(keys as Dictionary, plain as String, r as ByteArray, s as Number, ts as Number,
            iv as ByteArray?) as Dictionary {
        var vector = iv != null ? iv : Cryptography.randomBytes(16);
        var data = Bytes.fromText(plain);
        var c = cipher(keys[:toViewerEnc] as ByteArray, vector).encrypt(CIPHER_PADS ? data : Bytes.pad(data));
        var t = tag(keys[:toViewerMac] as ByteArray, TO_VIEWER, r, s, ts, vector, c);
        return {
            "v" => VERSION,
            "r" => Bytes.toBase64(r),
            "s" => s,
            "ts" => ts,
            "iv" => Bytes.toBase64(vector),
            "c" => Bytes.toBase64(c),
            "t" => Bytes.toBase64(t),
        };
    }

    //! The message (its JSON) in an envelope from the viewer, or the reason it is refused
    //! as a Symbol: :version, :tag (checked before decrypting), :clock (more than SKEW
    //! from `now`), :replay (`s` not above the last accepted from its run in `seen`,
    //! which this updates), :malformed.
    function open(keys as Dictionary, envelope as Dictionary, now as Number, seen as Dictionary) as String or Symbol {
        if (envelope["v"] != VERSION) {
            return :version;
        }
        var s = envelope["s"];
        var ts = envelope["ts"];
        var fields = [envelope["r"], envelope["iv"], envelope["c"], envelope["t"]];
        // A negative ts would reach encodeNumber as UINT32 in `tag`.
        if (!(s instanceof Number) || !(ts instanceof Number) || s < 1 || ts < 0) {
            return :malformed;
        }
        for (var i = 0; i < fields.size(); i++) {
            if (!(fields[i] instanceof String)) {
                return :malformed;
            }
        }
        var r = Bytes.fromBase64(fields[0] as String);
        var iv = Bytes.fromBase64(fields[1] as String);
        var c = Bytes.fromBase64(fields[2] as String);
        var t = Bytes.fromBase64(fields[3] as String);
        if (r.size() != 8 || iv.size() != 16 || t.size() != 16 || c.size() == 0 || c.size() % 16 != 0) {
            return :malformed;
        }
        if (!Bytes.same(tag(keys[:toWatchMac] as ByteArray, TO_WATCH, r, s as Number, ts as Number, iv, c), t)) {
            return :tag;
        }
        var off = (ts as Number) - now;
        if (off > SKEW || off < -SKEW) {
            return :clock;
        }
        // The run as its canonical base64, from its bytes: another spelling of the same
        // bytes (no padding, other unused bits) must not count as a new run.
        var run = Bytes.toBase64(r);
        var last = seen[run];
        if (last != null && (s as Number) <= (last as Number)) {
            return :replay;
        }
        var plain = cipher(keys[:toWatchEnc] as ByteArray, iv).decrypt(c);
        var data = CIPHER_PADS ? plain : Bytes.unpad(plain);
        if (data == null) {
            return :malformed;
        }
        seen[run] = s;
        return Bytes.toText(data);
    }
}
