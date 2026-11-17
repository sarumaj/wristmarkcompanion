import Toybox.Lang;
import Toybox.StringUtil;

//! Bytes and their texts for the control channel: base64 (standard, and unpadded
//! base64url for the channel's ID and the tokens), hex, UTF-8, big-endian numbers,
//! a constant-time comparison and PKCS#7 padding.
module Bytes {
    function toBase64(bytes as ByteArray) as String {
        return StringUtil.convertEncodedString(bytes, {
            :fromRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
            :toRepresentation => StringUtil.REPRESENTATION_STRING_BASE64,
        }) as String;
    }

    function fromBase64(text as String) as ByteArray {
        return StringUtil.convertEncodedString(text, {
            :fromRepresentation => StringUtil.REPRESENTATION_STRING_BASE64,
            :toRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
        }) as ByteArray;
    }

    //! Unpadded base64url: "+" to "-", "/" to "_", no "=".
    function toBase64Url(bytes as ByteArray) as String {
        var chars = toBase64(bytes).toCharArray();
        var out = "";
        for (var i = 0; i < chars.size(); i++) {
            var c = chars[i];
            if (c == '+') {
                out += "-";
            } else if (c == '/') {
                out += "_";
            } else if (c != '=') {
                out += c.toString();
            }
        }
        return out;
    }

    function toHex(bytes as ByteArray) as String {
        return StringUtil.convertEncodedString(bytes, {
            :fromRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
            :toRepresentation => StringUtil.REPRESENTATION_STRING_HEX,
        }) as String;
    }

    function fromHex(text as String) as ByteArray {
        return StringUtil.convertEncodedString(text, {
            :fromRepresentation => StringUtil.REPRESENTATION_STRING_HEX,
            :toRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
        }) as ByteArray;
    }

    function fromText(text as String) as ByteArray {
        return StringUtil.convertEncodedString(text, {
            :fromRepresentation => StringUtil.REPRESENTATION_STRING_PLAIN_TEXT,
            :toRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
        }) as ByteArray;
    }

    function toText(bytes as ByteArray) as String {
        return StringUtil.convertEncodedString(bytes, {
            :fromRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
            :toRepresentation => StringUtil.REPRESENTATION_STRING_PLAIN_TEXT,
        }) as String;
    }

    //! `value` as 4 bytes, big-endian.
    function uint32(value as Number) as ByteArray {
        var bytes = new [4]b;
        bytes.encodeNumber(value, Lang.NUMBER_FORMAT_UINT32, { :offset => 0, :endianness => Lang.ENDIAN_BIG });
        return bytes;
    }

    //! Equal, in a time that doesn't depend on where they differ.
    function same(a as ByteArray, b as ByteArray) as Boolean {
        if (a.size() != b.size()) {
            return false;
        }
        var difference = 0;
        for (var i = 0; i < a.size(); i++) {
            difference |= a[i] ^ b[i];
        }
        return difference == 0;
    }

    //! PKCS#7 padding to whole 16-byte blocks.
    function pad(bytes as ByteArray) as ByteArray {
        var count = 16 - bytes.size() % 16;
        var out = bytes.slice(0, null);
        for (var i = 0; i < count; i++) {
            out.add(count);
        }
        return out;
    }

    //! The bytes without their PKCS#7 padding, or null when it isn't one.
    function unpad(bytes as ByteArray) as ByteArray? {
        var size = bytes.size();
        if (size == 0 || size % 16 != 0) {
            return null;
        }
        var count = bytes[size - 1];
        if (count < 1 || count > 16) {
            return null;
        }
        for (var i = size - count; i < size; i++) {
            if (bytes[i] != count) {
                return null;
            }
        }
        return bytes.slice(0, size - count);
    }
}
