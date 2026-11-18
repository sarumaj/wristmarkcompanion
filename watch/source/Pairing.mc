import Toybox.Lang;

//! The optical handshake's frames (docs/dev/decisions/004-control-channel.md#pairing-the-optical-handshake),
//! as viewer/public/js/pairing.js reads them: 156 bits, most significant first: the
//! version (4 bits), S (128), a CRC-16/CCITT-FALSE over the version's byte and S (16),
//! and 8 zero bits; frame k carries bits 12k to 12k+11 as three markers of 4 bits each
//! (top right, bottom left, bottom right), its top left marker being its index, 32 + k.
module Pairing {
    const VERSION = 1;
    const FRAMES = 13;
    const INDEX_ID = 32;

    //! CRC-16/CCITT-FALSE: polynomial 0x1021, starting at 0xFFFF.
    function crc16(bytes as ByteArray) as Number {
        var crc = 0xFFFF;
        for (var i = 0; i < bytes.size(); i++) {
            crc ^= bytes[i] << 8;
            for (var bit = 0; bit < 8; bit++) {
                crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
            }
        }
        return crc;
    }

    //! The frames for S (16 bytes): each [index, top right, bottom left, bottom right].
    function frames(secret as ByteArray) as Array<Array<Number>> {
        var checked = new [1]b;
        checked[0] = VERSION;
        checked.addAll(secret);
        var crc = crc16(checked);
        // The bits, one per element.
        var bits = [] as Array<Number>;
        push(bits, VERSION, 4);
        for (var i = 0; i < secret.size(); i++) {
            push(bits, secret[i], 8);
        }
        push(bits, crc, 16);
        while (bits.size() < FRAMES * 12) {
            bits.add(0);
        }
        var out = [] as Array<Array<Number>>;
        for (var k = 0; k < FRAMES; k++) {
            out.add([INDEX_ID + k, nibble(bits, 12 * k), nibble(bits, 12 * k + 4), nibble(bits, 12 * k + 8)]);
        }
        return out;
    }

    function push(bits as Array<Number>, value as Number, width as Number) as Void {
        for (var i = width - 1; i >= 0; i--) {
            bits.add((value >> i) & 1);
        }
    }

    function nibble(bits as Array<Number>, at as Number) as Number {
        return (bits[at] << 3) | (bits[at + 1] << 2) | (bits[at + 2] << 1) | bits[at + 3];
    }
}
