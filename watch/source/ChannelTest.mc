import Toybox.Lang;
import Toybox.Test;

//! The control channel's unit tests, against the test vectors (ChannelVectors, generated
//! from protocol/channel-vectors.json's values): the same keys, the same envelopes byte for
//! byte as Node's crypto and the viewer's WebCrypto, every bad one refused for its reason,
//! and the same pairing frames. Run in the simulator: monkeyc --unit-test, then
//! monkeydo <app>.prg d2mach1 /t (docs/watch.md).
(:test)
module ChannelTest {
    function keysOf() as Dictionary {
        return ChannelCrypto.derive(Bytes.fromHex(ChannelVectors.secret()));
    }

    (:test)
    function testTheSessionIsTheVectors(logger as Test.Logger) as Boolean {
        var keys = keysOf();
        var expected = ChannelVectors.keys();
        Test.assertEqualMessage(keys[:id], ChannelVectors.id(), "id");
        Test.assertEqualMessage(keys[:watchToken], ChannelVectors.watchToken(), "watch token");
        Test.assertEqualMessage(keys[:viewerToken], ChannelVectors.viewerToken(), "viewer token");
        Test.assertEqualMessage(ChannelCrypto.tokenHash(keys[:watchToken] as String), ChannelVectors.watchHash(), "watch hash");
        Test.assertEqualMessage(ChannelCrypto.tokenHash(keys[:viewerToken] as String), ChannelVectors.viewerHash(), "viewer hash");
        Test.assertEqualMessage(Bytes.toHex(keys[:toWatchEnc] as ByteArray), expected["to-watch/enc"], "to-watch/enc");
        Test.assertEqualMessage(Bytes.toHex(keys[:toWatchMac] as ByteArray), expected["to-watch/mac"], "to-watch/mac");
        Test.assertEqualMessage(Bytes.toHex(keys[:toViewerEnc] as ByteArray), expected["to-viewer/enc"], "to-viewer/enc");
        Test.assertEqualMessage(Bytes.toHex(keys[:toViewerMac] as ByteArray), expected["to-viewer/mac"], "to-viewer/mac");
        return true;
    }

    //! The watch seals toward the viewer: its envelopes, from the message written by
    //! Json.write in the vector's key order, are the vectors' byte for byte.
    (:test)
    function testSealedAsTheVectors(logger as Test.Logger) as Boolean {
        var keys = keysOf();
        var vectors = ChannelVectors.envelopes();
        for (var i = 0; i < vectors.size(); i++) {
            var v = vectors[i] as Dictionary;
            if (v["direction"] != ChannelCrypto.TO_VIEWER) {
                continue;
            }
            var message = Json.read(v["plain"] as String);
            Test.assertMessage(message != null, v["name"] + ": its JSON reads");
            var plain = Json.write(message as Dictionary, v["keys"] as Array<String>);
            Test.assertEqualMessage(plain, v["plain"], v["name"] + ": written back the same");
            var sealed = ChannelCrypto.seal(keys, plain, Bytes.fromHex(v["r"] as String), v["s"] as Number,
                v["ts"] as Number, Bytes.fromHex(v["iv"] as String));
            var expected = v["envelope"] as Dictionary;
            var fields = ["v", "r", "s", "ts", "iv", "c", "t"];
            for (var f = 0; f < fields.size(); f++) {
                Test.assertEqualMessage(sealed[fields[f]], expected[fields[f]], v["name"] + ": " + fields[f]);
            }
        }
        return true;
    }

    //! The viewer's envelopes open to their messages, in order, with the run's counter kept.
    (:test)
    function testOpensTheViewersEnvelopes(logger as Test.Logger) as Boolean {
        var keys = keysOf();
        var vectors = ChannelVectors.envelopes();
        var seen = {};
        for (var i = 0; i < vectors.size(); i++) {
            var v = vectors[i] as Dictionary;
            if (v["direction"] != ChannelCrypto.TO_WATCH) {
                continue;
            }
            var opened = ChannelCrypto.open(keys, v["envelope"] as Dictionary, v["ts"] as Number, seen);
            Test.assertEqualMessage(opened, v["plain"], v["name"]);
        }
        return true;
    }

    (:test)
    function testRefusesWhatItMust(logger as Test.Logger) as Boolean {
        var keys = keysOf();
        var cases = ChannelVectors.rejected();
        for (var i = 0; i < cases.size(); i++) {
            var c = cases[i] as Dictionary;
            var seen = {};
            var given = c["seen"] as Dictionary;
            var runs = given.keys();
            for (var k = 0; k < runs.size(); k++) {
                seen[runs[k]] = given[runs[k]];
            }
            var opened = ChannelCrypto.open(keys, c["envelope"] as Dictionary, c["now"] as Number, seen);
            var reasons = { "tag" => :tag, "clock" => :clock, "replay" => :replay, "version" => :version };
            Test.assertEqualMessage(opened, reasons[c["reason"]], c["name"]);
        }
        return true;
    }

    //! An envelope the watch sealed itself, reflected back to it, doesn't verify.
    (:test)
    function testRefusesItsOwnReflected(logger as Test.Logger) as Boolean {
        var vectors = ChannelVectors.envelopes();
        for (var i = 0; i < vectors.size(); i++) {
            var v = vectors[i] as Dictionary;
            if (v["direction"] == ChannelCrypto.TO_VIEWER) {
                var opened = ChannelCrypto.open(keysOf(), v["envelope"] as Dictionary, v["ts"] as Number, {});
                Test.assertEqualMessage(opened, :tag, v["name"]);
            }
        }
        return true;
    }

    (:test)
    function testPairingFrames(logger as Test.Logger) as Boolean {
        var secret = Bytes.fromHex(ChannelVectors.secret());
        var checked = new [1]b;
        checked[0] = Pairing.VERSION;
        checked.addAll(secret);
        Test.assertEqualMessage(Pairing.crc16(checked), ChannelVectors.crc(), "CRC");
        var frames = Pairing.frames(secret);
        var expected = ChannelVectors.frames();
        Test.assertEqualMessage(frames.size(), expected.size(), "13 frames");
        for (var k = 0; k < frames.size(); k++) {
            for (var m = 0; m < 4; m++) {
                Test.assertEqualMessage(frames[k][m], (expected[k] as Array)[m], "frame " + k + ", marker " + m);
            }
        }
        return true;
    }

    (:test)
    function testJsonReadsAndWrites(logger as Test.Logger) as Boolean {
        var read = Json.read("{\"op\":\"cycle\",\"on\":true,\"id\":-3,\"name\":\"a \\\"b\\\"\"}");
        Test.assert(read != null);
        Test.assertEqual(read["op"], "cycle");
        Test.assertEqual(read["on"], true);
        Test.assertEqual(read["id"], -3);
        Test.assertEqual(read["name"], "a \"b\"");
        Test.assertEqual(Json.read("[1]"), null);
        Test.assertEqual(Json.read("{\"a\":}"), null);
        Test.assertEqual(Json.write({ "op" => "state", "cycle" => false, "id" => 4 }, ["op", "id", "cycle"]),
            "{\"op\":\"state\",\"id\":4,\"cycle\":false}");
        return true;
    }

    (:test)
    function testPadding(logger as Test.Logger) as Boolean {
        var bytes = [1, 2, 3]b;
        var padded = Bytes.pad(bytes);
        Test.assertEqual(padded.size(), 16);
        Test.assertEqual(padded[15], 13);
        Test.assert(Bytes.same(Bytes.unpad(padded) as ByteArray, bytes));
        Test.assertEqual(Bytes.pad(new [16]b).size(), 32);
        var broken = padded.slice(0, null);
        broken[14] = 1;
        Test.assertEqual(Bytes.unpad(broken), null);
        return true;
    }
}
