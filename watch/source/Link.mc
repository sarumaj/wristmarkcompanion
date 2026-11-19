import Toybox.Communications;
import Toybox.Cryptography;
import Toybox.Lang;
import Toybox.PersistedContent;
import Toybox.System;
import Toybox.Time;

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
    //! After a failure (no phone, no network), the next try: at the first `tick` this long
    //! after. Link has no timer of its own: a watch app may run only a few (3 on some
    //! devices), and the marker's and the pairing screen's ticks come anyway.
    const RETRY_MS = 5000;
    //! The most envelopes waiting to go out; past it the oldest goes. A watch out of reach
    //! of its phone must not fill its memory with states nobody reads.
    const OUTBOX_MAX = 12;

    var sessions as Sessions;
    //! The session being paired, polled with the others until the viewer's hello comes.
    var pairing as Dictionary? = null;
    //! Told about commands and pairings: the app (WristmarkApp).
    private var _listener as WristmarkApp;
    //! This run: random at each start, and the counter of the envelopes sent in it.
    private var _run as ByteArray;
    private var _sent as Number = 0;
    private var _wait as Number = WAIT;
    //! What waits to go out: [session, envelope, op], or [session, null, null] for the
    //! channel's delete; and channels to create again.
    private var _outbox as Array<Array> = [];
    private var _create as Array<Dictionary> = [];
    //! A request in flight, and whether it is the long-poll: only the poll is cancelled for
    //! something to send; a send or a create runs to its end.
    private var _busy as Boolean = false;
    private var _polling as Boolean = false;
    private var _running as Boolean = false;
    //! When (System.getTimer) to try again after a failure; null when no try waits.
    private var _retryAt as Number? = null;
    //! What the link does, or the last thing that went wrong, for the pairing screen: a
    //! pairing that never completes says there where it stops.
    var status as String = "";

    function initialize(listener as WristmarkApp) {
        sessions = new Sessions();
        _listener = listener;
        _run = Cryptography.randomBytes(8);
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
        _retryAt = null;
        _polling = false;
        Communications.cancelAllRequests();
        _busy = false;
        sessions.save();
    }

    //! Called every few seconds (MarkerView's and PairingView's timers): the try after a
    //! failure, once it is due.
    function tick() as Void {
        if (_retryAt != null && System.getTimer() - (_retryAt as Number) >= 0) {
            _retryAt = null;
            next();
        }
    }

    //! Pairs a new viewer: its channel is created and polled; the viewer's hello confirms it.
    function pair(secret as ByteArray) as Void {
        pairing = sessions.start(secret);
        _create.add(pairing as Dictionary);
        interrupt();
    }

    function cancelPairing() as Void {
        pairing = null;
    }

    //! Sends `message` (a flat Dictionary, written in the order of `keys`) to one session,
    //! or to all of them when `session` is null. A state replaces one still waiting for the
    //! same session: only the latest counts.
    function send(session as Dictionary?, message as Dictionary, keys as Array<String>) as Void {
        var targets = session != null ? [session] : sessions.list;
        var plain = Json.write(message, keys);
        var op = message["op"] as Object?;
        for (var i = 0; i < targets.size(); i++) {
            var target = targets[i] as Dictionary;
            // A message either way is a use (docs/dev/decisions/004-control-channel.md#sessions),
            // as the viewer counts it, so that both sides expire a session alike.
            sessions.used(target);
            if ("state".equals(op)) {
                // Not the head while it is in flight.
                for (var k = _outbox.size() - 1; k >= (_busy && !_polling ? 1 : 0); k--) {
                    if (_outbox[k][0] == target && "state".equals(_outbox[k][2] as Object?)) {
                        _outbox.remove(_outbox[k]);
                    }
                }
            }
            _sent++;
            var envelope = ChannelCrypto.seal(target[:keys] as Dictionary, plain, _run, _sent, Time.now().value(), null);
            queue([target, envelope, op]);
        }
        interrupt();
    }

    //! Ends a session here and for its viewer: a bye, then the channel deleted, whose
    //! tombstone at the relay tells the viewer also when it comes back days later.
    function end(session as Dictionary) as Void {
        send(session, { "op" => "bye" }, ["op"]);
        queue([session, null, null]);
        sessions.forget(session);
        interrupt();
    }

    private function queue(item as Array) as Void {
        _outbox.add(item);
        if (_outbox.size() > OUTBOX_MAX) {
            _outbox.remove(_outbox[_busy && !_polling ? 1 : 0]);
        }
    }

    //! Something to do: at once when idle, or after cancelling the long-poll. The cancelled
    //! poll's callback, if one still comes, is ignored (`_polling` is false by then).
    private function interrupt() as Void {
        if (_polling) {
            _polling = false;
            _busy = false;
            Communications.cancelAllRequests();
        }
        if (!_busy) {
            _retryAt = null;
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
            status = "Creating the channel";
            request(Communications.HTTP_REQUEST_METHOD_PUT, "/channels/" + (keys[:id] as String), {
                "watch" => ChannelCrypto.tokenHash(keys[:watchToken] as String),
                "viewer" => ChannelCrypto.tokenHash(keys[:viewerToken] as String),
            }, null, method(:onCreated));
        } else if (_outbox.size() > 0) {
            var item = _outbox[0];
            var keys = (item[0] as Dictionary)[:keys] as Dictionary;
            if (item[1] == null) {
                request(Communications.HTTP_REQUEST_METHOD_DELETE, "/channels/" + (keys[:id] as String), {},
                    keys[:watchToken] as String, method(:onSent));
            } else {
                request(Communications.HTTP_REQUEST_METHOD_POST, "/channels/" + (keys[:id] as String) + "/to-viewer",
                    item[1] as Dictionary, keys[:watchToken] as String, method(:onSent));
            }
        } else {
            poll();
        }
    }

    private function polled() as Array<Dictionary> {
        var all = sessions.list.slice(0, null);
        if (pairing != null) {
            all.add(pairing as Dictionary);
        }
        return all;
    }

    private function poll() as Void {
        var all = polled();
        if (all.size() == 0) {
            return;
        }
        var channels = [] as Array<Dictionary>;
        for (var i = 0; i < all.size(); i++) {
            var keys = all[i][:keys] as Dictionary;
            channels.add({ "id" => keys[:id], "token" => keys[:watchToken], "after" => all[i][:after] });
        }
        request(Communications.HTTP_REQUEST_METHOD_POST, "/poll", { "wait" => _wait, "channels" => channels }, null, method(:onPoll));
        _polling = true;
        if (status.length() == 0 || status.find("Creating") == 0) {
            status = "Waiting for the phone";
        }
    }

    private function request(verb as Communications.HttpRequestMethod, path as String, body as Dictionary, token as String?,
            callback as Method(code as Number, data as RelayResponse) as Void) as Void {
        var headers = { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON } as Dictionary<String, String or Number>;
        if (token != null) {
            headers["Authorization"] = "Bearer " + token;
        }
        _busy = true;
        _polling = false;
        Communications.makeWebRequest(ViewerAddress.RELAY + path, body as Dictionary<Object, Object>, {
            :method => verb,
            :headers => headers,
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
        }, callback);
    }

    //! A request failed: try again a little later (not at once, which would spin while the
    //! phone is away).
    private function failed() as Void {
        _retryAt = System.getTimer() + RETRY_MS;
    }

    //! The relay answered, and refuses the request for good (4xx): retrying gains nothing.
    //! INVALID_HTTP_BODY_IN_NETWORK_RESPONSE: an answer whose body wasn't the JSON asked
    //! for, so the request reached the relay.
    private function settled(code as Number) as Boolean {
        return (code >= 200 && code < 500) || code == Communications.INVALID_HTTP_BODY_IN_NETWORK_RESPONSE;
    }

    function onCreated(code as Number, data as RelayResponse) as Void {
        _busy = false;
        if (_create.size() == 0) {
            next();
            return;
        }
        if (settled(code)) {
            status = "Channel created (" + code + ")";
            // 409: the relay has the channel with other tokens; the poll lists it as gone.
            // 410: the viewer ended the pairing; forgotten here too.
            var session = _create[0];
            _create.remove(session);
            if (code == 410) {
                ended(session);
            }
            next();
        } else {
            status = problem("Relay not reached", code);
            failed();
        }
    }

    function onSent(code as Number, data as RelayResponse) as Void {
        _busy = false;
        if (_outbox.size() == 0) {
            next();
            return;
        }
        if (settled(code)) {
            // Sent, or never will be: the channel gone, ended, full or refused.
            var item = _outbox[0];
            _outbox.remove(item);
            var session = item[0] as Dictionary;
            if (code == 404 && item[1] != null && sessions.list.indexOf(session) >= 0) {
                _create.add(session);
                // Sent again once the channel is back.
                _outbox.add(item);
            } else if (code == 410) {
                ended(session);
            }
            next();
        } else {
            status = problem("Sending failed", code);
            failed();
        }
    }

    function onPoll(code as Number, data as RelayResponse) as Void {
        if (!_polling) {
            // Cancelled for something to send, which went out already.
            return;
        }
        _polling = false;
        _busy = false;
        if (code == Communications.NETWORK_REQUEST_TIMED_OUT) {
            status = "Poll timed out, waiting " + (_wait / 2 > WAIT_MIN ? _wait / 2 : WAIT_MIN) + " s";
            _wait = _wait / 2 > WAIT_MIN ? _wait / 2 : WAIT_MIN;
            next();
            return;
        }
        if (code != 200 || !(data instanceof Dictionary)) {
            status = problem("Poll failed", code);
            if (_outbox.size() > 0 || _create.size() > 0) {
                next();
            } else {
                failed();
            }
            return;
        }
        var unknown = data["unknown"];
        var gone = data["gone"];
        var messages = data["messages"];
        var all = polled();
        var now = Time.now().value();
        for (var i = 0; i < all.size(); i++) {
            var session = all[i];
            var keys = session[:keys] as Dictionary;
            if (unknown instanceof Array && unknown.indexOf(keys[:id]) >= 0) {
                // Created again, its queue numbers from 1 again.
                session[:after] = 0;
                _create.add(session);
            }
            if (gone instanceof Array && gone.indexOf(keys[:id]) >= 0) {
                ended(session);
                continue;
            }
            if (!(messages instanceof Dictionary)) {
                continue;
            }
            var queued = messages[keys[:id]];
            if (!(queued instanceof Array)) {
                continue;
            }
            for (var m = 0; m < queued.size(); m++) {
                var item = queued[m];
                if (!(item instanceof Dictionary) || !(item["q"] instanceof Number)) {
                    continue;
                }
                // Acknowledged whatever it holds: one that can't be opened never will be.
                session[:after] = item["q"];
                var envelope = item["e"];
                if (!(envelope instanceof Dictionary)) {
                    continue;
                }
                var opened = null as String or Symbol or Null;
                try {
                    opened = ChannelCrypto.open(keys, envelope, now, session[:seen] as Dictionary);
                } catch (e) {
                    // Malformed (base64 the system refuses, a number out of range): dropped.
                    opened = :error;
                    var text = e.getErrorMessage();
                    status = "Message broke: " + (text != null ? text : "error");
                }
                if (opened instanceof Symbol && opened != :error) {
                    status = "Message refused: " + refusal(opened as Symbol);
                }
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

    //! A failed request for the pairing screen: what, and the code (an HTTP status, or a
    //! negative one of Communications, e.g. -104 for no phone connection).
    private function problem(what as String, code as Number) as String {
        if (code == Communications.BLE_CONNECTION_UNAVAILABLE) {
            return what + ": no phone (" + code + ")";
        }
        return what + " (" + code + ")";
    }

    //! Why ChannelCrypto.open refused a message, in words.
    private function refusal(reason as Symbol) as String {
        if (reason == :tag) {
            return "wrong key";
        } else if (reason == :clock) {
            return "clocks apart";
        } else if (reason == :replay) {
            return "replayed";
        } else if (reason == :version) {
            return "other version";
        }
        return "malformed";
    }

    //! The viewer ended the session (the relay's tombstone): forgotten here, its queued
    //! messages dropped.
    private function ended(session as Dictionary) as Void {
        if (session == pairing) {
            return;
        }
        for (var i = _outbox.size() - 1; i >= 0; i--) {
            if (_outbox[i][0] == session) {
                _outbox.remove(_outbox[i]);
            }
        }
        if (sessions.list.indexOf(session) >= 0) {
            sessions.forget(session);
            _listener.unpaired(session);
        }
    }

    //! A message from a viewer that opened: pairing's hello, or a command for the app.
    private function received(session as Dictionary, message as Dictionary) as Void {
        var op = message["op"] as Object?;
        if (session == pairing) {
            status = "Got " + (op != null ? op.toString() : "a message");
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
