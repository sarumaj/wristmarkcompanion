import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! The app: one view showing a marker, and its buttons.
class WristmarkApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new MarkerView();
        return [view, new MarkerDelegate(view)];
    }
}
