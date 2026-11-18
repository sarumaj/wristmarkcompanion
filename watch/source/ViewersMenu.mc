import Toybox.Cryptography;
import Toybox.Lang;
import Toybox.WatchUi;

//! The menu (the menu button, or a long press): start or stop the automatic cycle (also a
//! tap or start on a marker, but this one says so), pair a viewer, forget one, forget all.
module ViewersMenu {
    function show(link as Link, view as MarkerView) as Void {
        var menu = new WatchUi.Menu2({ :title => "Menu" });
        menu.addItem(new WatchUi.MenuItem(view.cycling() ? "Stop auto cycle" : "Auto cycle", view.cycling() ? null : "5 s per marker", :cycle, null));
        menu.addItem(new WatchUi.MenuItem("Pair a viewer", null, :pair, null));
        var list = link.sessions.list;
        for (var i = 0; i < list.size(); i++) {
            menu.addItem(new WatchUi.MenuItem("Forget " + (list[i]["name"] as String), null, i, null));
        }
        if (list.size() > 1) {
            menu.addItem(new WatchUi.MenuItem("Forget all", null, :forgetAll, null));
        }
        WatchUi.pushView(menu, new ViewersMenuDelegate(link, view), WatchUi.SLIDE_UP);
    }
}

class ViewersMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _link as Link;
    private var _view as MarkerView;

    function initialize(link as Link, view as MarkerView) {
        Menu2InputDelegate.initialize();
        _link = link;
        _view = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :cycle) {
            // From the Viewers screen to the first marker: the cycle shows markers only.
            if (_view.onViewers()) {
                _view.step(1);
            }
            _view.toggleCycle();
        } else if (id == :pair) {
            var secret = Cryptography.randomBytes(16);
            _link.pair(secret);
            WatchUi.pushView(new PairingView(_link, secret), new PairingDelegate(_link), WatchUi.SLIDE_UP);
        } else if (id == :forgetAll) {
            _link.send(null, { "op" => "bye" }, ["op"]);
            _link.sessions.forgetAll();
        } else if (id instanceof Number) {
            var session = _link.sessions.list[id];
            _link.send(session, { "op" => "bye" }, ["op"]);
            _link.sessions.forget(session);
        }
    }
}
