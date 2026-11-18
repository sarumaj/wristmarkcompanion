import Toybox.Application;
import Toybox.Attention;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! The app: one view showing a marker and its buttons, and the control channel to the
//! paired viewers (Link), open while the app is.
class WristmarkApp extends Application.AppBase {
    var link as Link;
    private var _view as MarkerView;

    function initialize() {
        AppBase.initialize();
        _view = new MarkerView();
        link = new Link(self);
        _view.onChange = method(:changed);
    }

    function onStart(state as Dictionary?) as Void {
        link.start();
    }

    function onStop(state as Dictionary?) as Void {
        link.stop();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        return [_view, new MarkerDelegate(_view)];
    }

    //! The marker or the cycle changed: every paired viewer is told.
    function changed() as Void {
        sendState(null);
    }

    function sendState(session as Dictionary?) as Void {
        if (link.sessions.list.size() == 0) {
            return;
        }
        var battery = System.getSystemStats().battery.toNumber();
        link.send(session, { "op" => "state", "id" => _view.shown(), "cycle" => _view.cycling(), "battery" => battery },
            ["op", "id", "cycle", "battery"]);
    }

    //! A viewer's hello confirmed a pairing: the pairing screen goes, a short buzz.
    function paired(session as Dictionary) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        buzz(150);
        sendState(session);
    }

    function unpaired(session as Dictionary) as Void {
        buzz(80);
    }

    //! A command from a paired viewer (docs/dev/decisions/004-control-channel.md#messages).
    function command(session as Dictionary, message as Dictionary) as Void {
        var op = message["op"] as Object?;
        if ("show".equals(op) && message["id"] instanceof Number) {
            _view.showId(message["id"] as Number);
        } else if ("step".equals(op) && message["delta"] instanceof Number) {
            _view.step((message["delta"] as Number) < 0 ? -1 : 1);
        } else if ("cycle".equals(op) && message["on"] instanceof Boolean) {
            _view.setCycle(message["on"] as Boolean);
        } else if ("buzz".equals(op)) {
            var ms = message["ms"];
            buzz(ms instanceof Number && ms > 0 && ms <= 2000 ? ms : 300);
        } else if ("hello".equals(op)) {
            sendState(session);
        }
    }

    function buzz(ms as Number) as Void {
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(75, ms)]);
        }
    }
}
