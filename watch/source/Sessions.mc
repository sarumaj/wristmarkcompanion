import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;

//! The viewers this watch is paired with (docs/decisions/004-control-channel.md#sessions):
//! at most four; a session ends 7 days after its last use or 30 days after its pairing.
//! Application.Storage keeps each one's S (base64), the viewer's name, when it was paired
//! and last used; the keys are derived again at start. Written at pairing, when one is
//! forgotten and when the app closes, not per message.
class Sessions {
    const MAX = 4;
    const UNUSED_DAYS = 7;
    const AGE_DAYS = 30;
    const KEY = "sessions";

    //! Each: {"s", "name", "paired", "used"} as stored, and :keys, :after, :seen at run time.
    var list as Array<Dictionary> = [];

    function initialize() {
        var stored = Application.Storage.getValue(KEY);
        var now = Time.now().value();
        if (stored instanceof Array) {
            for (var i = 0; i < stored.size(); i++) {
                var entry = stored[i] as Dictionary;
                if (!expired(entry, now)) {
                    list.add(prepare(entry));
                }
            }
        }
    }

    function expired(entry as Dictionary, now as Number) as Boolean {
        var day = 86400;
        return now - (entry["used"] as Number) > UNUSED_DAYS * day || now - (entry["paired"] as Number) > AGE_DAYS * day;
    }

    //! A stored entry with what it needs at run time: its keys, the relay's last place
    //! taken (:after) and the counters seen per run (:seen).
    function prepare(entry as Dictionary) as Dictionary {
        entry[:keys] = ChannelCrypto.derive(Bytes.fromBase64(entry["s"] as String));
        entry[:after] = 0;
        entry[:seen] = {};
        return entry;
    }

    //! A new session for S, not stored until confirmed (`confirm`).
    function start(secret as ByteArray) as Dictionary {
        var now = Time.now().value();
        return prepare({ "s" => Bytes.toBase64(secret), "name" => "", "paired" => now, "used" => now });
    }

    //! The viewer's hello came: the session is kept; a fifth drops the one used longest ago.
    function confirm(session as Dictionary, name as String) as Void {
        session["name"] = name;
        list.add(session);
        if (list.size() > MAX) {
            var oldest = 0;
            for (var i = 1; i < list.size(); i++) {
                if ((list[i]["used"] as Number) < (list[oldest]["used"] as Number)) {
                    oldest = i;
                }
            }
            list.remove(list[oldest]);
        }
        save();
    }

    function used(session as Dictionary) as Void {
        session["used"] = Time.now().value();
    }

    function forget(session as Dictionary) as Void {
        list.remove(session);
        save();
    }

    function forgetAll() as Void {
        list = [];
        save();
    }

    function save() as Void {
        var stored = [];
        for (var i = 0; i < list.size(); i++) {
            var entry = list[i];
            stored.add({ "s" => entry["s"], "name" => entry["name"], "paired" => entry["paired"], "used" => entry["used"] });
        }
        Application.Storage.setValue(KEY, stored as Array<Application.Storage.ValueType>);
    }
}
