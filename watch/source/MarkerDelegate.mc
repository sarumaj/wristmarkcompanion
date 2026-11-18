import Toybox.Application;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

//! The controls: down or a swipe up for the next marker, up or a swipe down for the
//! previous one, a tap or a press of start to start or stop the automatic cycle; the menu
//! for the paired viewers by holding up (the menu button), holding start, a long touch,
//! or start or a tap on the Viewers screen (after the last marker), since a watch may keep
//! a button for itself. Back leaves the app (the system's default).
class MarkerDelegate extends WatchUi.BehaviorDelegate {
    //! How long start is held to open the menu, in milliseconds.
    const HOLD_MS = 800;

    private var _view as MarkerView;
    private var _hold as Timer.Timer;
    //! Whether the start button now down has opened the menu: its release then does nothing.
    private var _held as Boolean = false;

    function initialize(view as MarkerView) {
        BehaviorDelegate.initialize();
        _view = view;
        _hold = new Timer.Timer();
    }

    //! Start is read here as pressed and released, to tell a press from a hold; the
    //! behavior (onSelect) is left to taps, which don't come through here.
    function onKey(event as WatchUi.KeyEvent) as Boolean {
        if (event.getKey() == WatchUi.KEY_ENTER) {
            return true;
        }
        return BehaviorDelegate.onKey(event);
    }

    function onKeyPressed(event as WatchUi.KeyEvent) as Boolean {
        if (event.getKey() != WatchUi.KEY_ENTER) {
            return false;
        }
        _held = false;
        _hold.start(method(:onStartHeld), HOLD_MS, false);
        return true;
    }

    function onKeyReleased(event as WatchUi.KeyEvent) as Boolean {
        if (event.getKey() != WatchUi.KEY_ENTER) {
            return false;
        }
        _hold.stop();
        if (!_held) {
            select();
        }
        _held = false;
        return true;
    }

    //! Start held long enough: the menu, while the button is still down.
    function onStartHeld() as Void {
        _held = true;
        onMenu();
    }

    function onNextPage() as Boolean {
        _view.step(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        _view.step(-1);
        return true;
    }

    function onSelect() as Boolean {
        select();
        return true;
    }

    //! A long touch on the screen: the menu.
    function onHold(clickEvent as WatchUi.ClickEvent) as Boolean {
        onMenu();
        return true;
    }

    //! Start or a tap: on the Viewers screen the menu, on a marker the cycle.
    private function select() as Void {
        if (_view.onViewers()) {
            onMenu();
        } else {
            _view.toggleCycle();
        }
    }

    //! The menu button or a long press: the viewers (pair, forget).
    function onMenu() as Boolean {
        ViewersMenu.show((Application.getApp() as WristmarkApp).link);
        return true;
    }
}
