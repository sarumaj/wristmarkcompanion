import Toybox.Cryptography;
import Toybox.Lang;
import Toybox.WatchUi;

//! The menu (the menu button, or a long press): pair a viewer, forget one, forget all.
module ViewersMenu {
    function show(link as Link) as Void {
        var menu = new WatchUi.Menu2({ :title => "Viewers" });
        menu.addItem(new WatchUi.MenuItem("Pair a viewer", null, :pair, null));
        var list = link.sessions.list;
        for (var i = 0; i < list.size(); i++) {
            menu.addItem(new WatchUi.MenuItem("Forget " + (list[i]["name"] as String), null, i, null));
        }
        if (list.size() > 1) {
            menu.addItem(new WatchUi.MenuItem("Forget all", null, :forgetAll, null));
        }
        WatchUi.pushView(menu, new ViewersMenuDelegate(link), WatchUi.SLIDE_UP);
    }
}

class ViewersMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _link as Link;

    function initialize(link as Link) {
        Menu2InputDelegate.initialize();
        _link = link;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :pair) {
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
