import Toybox.Communications;
import Toybox.Cryptography;
import Toybox.Lang;
import Toybox.PersistedContent;
import Toybox.Time;
import Toybox.Timer;

//! The watch's end of the control channel (docs/dev/decisions/004-control-channel.md): one
//! request at a time to the relay through the phone. Mostly the long-poll over every
//! session's channel (and the one being paired); a message to send cancels it, goes out,
//! and the long-poll starts again. Only while the app is open: started in onShow, stopped
//! in onHide.
//! What makeWebRequest hands its callback.
typedef RelayResponse as Null or ByteArray or Dictionary or String or PersistedContent.Iterator;

class Link {
    //! The long-poll's wait to start with, in seconds; halved after each timeout of the
    //! phone's proxy, whose limit Garmin doesn't document (the spike measures it).
    const WAIT = 25;
    const WAIT_MIN = 5;
    //! After a failure (no phone, no network), the next try.
    const RETRY_MS = 5000;

    var sessions as Sessions;
    //! The session being paired, polled with the others until the viewer's hello comes.
    var pairing as Dictionary? = null;
    //! Told about commands and pairings: the app (WristmarkApp).
    private var _listener as WristmarkApp;
    //! This run: random at each start, and the counter of the envelopes sent in it.
    private var _run as ByteArray;
    private var _sent as Number = 0;
    private var _wait as Number = WAIT;
    //! What waits to go out: [session, envelope]; and channels to create again.
    private var _outbox as Array<Array> = [];
    private var _create as Array<Dictionary> = [];
    private var _busy as Boolean = false;
    private var _running as Boolean = false;
    private var _retry as Timer.Timer;

    function initialize(listener as WristmarkApp) {
        sessions = new Sessions();
        _listener = listener;
        _run = Cryptography.randomBytes(8);
        _retry = new Timer.Timer();
    }

    function start() as Void {
        _running = true;
        // Each channel created again: the relay may have forgotten it (a restart, or
        // 15 idle minutes); the same hashes again are harmless.
        _create = sessions.list.slice(0, null);
        next();
    }

    function stop() as Void {
        _running = false;
        _retry.stop();
        Communications.cancelAllRequests();
        _busy = false;
        sessions.save();
    }

    //! Pairs a new viewer: its channel is created and polled; the viewer's hello confirms it.
    function pair(secret as ByteArray) as Void {
        pairing = sessions.start(secret);
        _create.add(pairing);
        interrupt();
    }

    function cancelPairing() as Void {
        pairing = null;
    }

    //! Sends `message` (a flat Dictionary, written in the order of `keys`) to one session,
    //! or to all of them when `session` is null.
    function send(session as Dictionary?, message as Dictionary, keys as Array<String>) as Void {
        var targets = session != null ? [session] : sessions.list;
        var plain = Json.write(message, keys);
        for (var i = 0; i < targets.size(); i++) {
            _sent++;
            var envelope = ChannelCrypto.seal(targets[i][:keys] as Dictionary, plain, _run, _sent, Time.now().value(), null);
            _outbox.add([targets[i], envelope]);
        }
        interrupt();
    }

    //! Something to do before the long-poll ends by itself: cancel it.
    private function interrupt() as Void {
        if (_busy) {
            Communications.cancelAllRequests();
        } else {
            next();
        }
    }

    function next() as Void {
        if (!_running || _busy) {
            return;
        }
        if (_create.size() > 0) {
            var session = _create[0];
            var keys = session[:keys] as Dictionary;
            request(Communications.HTTP_REQUEST_METHOD_PUT, "/channels/" + (keys[:id] as String), {
                "watch" => ChannelCrypto.tokenHash(keys[:watchToken] as String),
                "viewer" => ChannelCrypto.tokenHash(keys[:viewerToken] as String),
            }, null, method(:onCreated));
        } else if (_outbox.size() > 0) {
            var item = _outbox[0];
            var keys = (item[0] as Dictionary)[:keys] as Dictionary;
            request(Communications.HTTP_REQUEST_METHOD_POST, "/channels/" + (keys[:id] as String) + "/to-viewer",
                item[1] as Dictionary, keys[:watchToken] as String, method(:onSent));
        } else {
            poll();
        }
    }

    private function polled() as Array<Dictionary> {
        var all = sessions.list.slice(0, null);
        if (pairing != null) {
            all.add(pairing);
        }
        return all;
    }

    private function poll() as Void {
        var all = polled();
        if (all.size() == 0) {
            return;
        }
        var channels = [];
        for (var i = 0; i < all.size(); i++) {
            var keys = all[i][:keys] as Dictionary;
            channels.add({ "id" => keys[:id], "token" => keys[:watchToken], "after" => all[i][:after] });
        }
        request(Communications.HTTP_REQUEST_METHOD_POST, "/poll", { "wait" => _wait, "channels" => channels }, null, method(:onPoll));
    }

    private function request(verb as Communications.HttpRequestMethod, path as String, body as Dictionary, token as String?,
            callback as Method(code as Number, data as RelayResponse) as Void) as Void {
        var headers = { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON };
        if (token != null) {
            headers["Authorization"] = "Bearer " + token;
        }
        _busy = true;
        Communications.makeWebRequest(ViewerAddress.RELAY + path, body as Dictionary<Object, Object>, {
            :method => verb,
            :headers => headers,
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
        }, callback);
    }

    //! A request failed: try again a little later (not at once, which would spin while the
    //! phone is away).
    private function failed() as Void {
        _retry.start(method(:next), RETRY_MS, false);
    }

    function onCreated(code as Number, data as RelayResponse) as Void {
        _busy = false;
        if (code == 201 || code == 204 || code == 409) {
            // 409: the relay has the channel with other tokens; nothing to do but drop it.
            _create.remove(_create[0]);
            next();
        } else {
            failed();
        }
    }

    function onSent(code as Number, data as RelayResponse) as Void {
        _busy = false;
        if (code == 202 || code == 404 || code == 401 || code == 413) {
            // Sent, or never will be: the channel gone or refused.
            var item = _outbox[0];
            _outbox.remove(item);
            if (code == 404) {
                _create.add(item[0] as Dictionary);
            }
            next();
        } else {
            failed();
        }
    }

    function onPoll(code as Number, data as RelayResponse) as Void {
        _busy = false;
        if (code == Communications.NETWORK_REQUEST_TIMED_OUT) {
            _wait = _wait / 2 > WAIT_MIN ? _wait / 2 : WAIT_MIN;
            next();
            return;
        }
        if (code != 200 || !(data instanceof Dictionary)) {
            // Cancelled for a message to send, or a failure.
            if (_outbox.size() > 0 || _create.size() > 0) {
                next();
            } else {
                failed();
            }
            return;
        }
        var unknown = data["unknown"];
        var messages = data["messages"];
        var all = polled();
        var now = Time.now().value();
        for (var i = 0; i < all.size(); i++) {
            var session = all[i];
            var keys = session[:keys] as Dictionary;
            if (unknown instanceof Array && unknown.indexOf(keys[:id]) >= 0) {
                _create.add(session);
            }
            if (!(messages instanceof Dictionary)) {
                continue;
            }
            var queued = messages[keys[:id]];
            if (!(queued instanceof Array)) {
                continue;
            }
            for (var m = 0; m < queued.size(); m++) {
                var item = queued[m] as Dictionary;
                session[:after] = item["q"];
                var opened = ChannelCrypto.open(keys, item["e"] as Dictionary, now, session[:seen] as Dictionary);
                if (opened instanceof String) {
                    var message = Json.read(opened);
                    if (message != null) {
                        received(session, message);
                    }
                }
            }
        }
        next();
    }

    //! A message from a viewer that opened: pairing's hello, or a command for the app.
    private function received(session as Dictionary, message as Dictionary) as Void {
        var op = message["op"] as Object?;
        if (session == pairing) {
            if ("hello".equals(op)) {
                pairing = null;
                var name = message["name"];
                sessions.confirm(session, name instanceof String ? name : "Viewer");
                _listener.paired(session);
            }
            return;
        }
        sessions.used(session);
        if ("bye".equals(op)) {
            sessions.forget(session);
            _listener.unpaired(session);
            return;
        }
        _listener.command(session, message);
    }
}
