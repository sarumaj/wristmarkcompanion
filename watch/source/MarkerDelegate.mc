import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! The controls: down or a swipe up for the next marker, up or a swipe down for the
//! previous one, enter or a tap to start or stop the automatic cycle, the menu for the
//! paired viewers. Back leaves the app (the system's default).
class MarkerDelegate extends WatchUi.BehaviorDelegate {
    private var _view as MarkerView;

    function initialize(view as MarkerView) {
        BehaviorDelegate.initialize();
        _view = view;
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
        _view.toggleCycle();
        return true;
    }

    //! The menu button or a long press: the viewers (pair, forget).
    function onMenu() as Boolean {
        ViewersMenu.show((Application.getApp() as WristmarkApp).link);
        return true;
    }
}
