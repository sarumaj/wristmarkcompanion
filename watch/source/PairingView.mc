import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Timer;
import Toybox.WatchUi;

//! Pairing a viewer: the secret's 13 frames of four markers in turn (Pairing), a third of
//! a second each, for at most two minutes, until the viewer's hello arrives (Link). The
//! display is held on meanwhile. Back cancels.
class PairingView extends WatchUi.View {
    const FRAME_MS = 333;
    const GIVE_UP_MS = 120000;
    const KEEP_ON_MS = 5000;

    private var _frames as Array<Array<Number>>;
    private var _frame as Number = 0;
    private var _shown as Number = 0;
    private var _timer as Timer.Timer;
    private var _link as Link;

    function initialize(link as Link, secret as ByteArray) {
        View.initialize();
        _link = link;
        _frames = Pairing.frames(secret);
        _timer = new Timer.Timer();
    }

    function onShow() as Void {
        _timer.start(method(:tick), FRAME_MS, true);
    }

    function onHide() as Void {
        _timer.stop();
    }

    function tick() as Void {
        // The link's retries ride on this timer while the pairing shows (Link.tick).
        _link.tick();
        _frame = (_frame + 1) % _frames.size();
        _shown += FRAME_MS;
        if (_shown % KEEP_ON_MS < FRAME_MS && Attention has :backlight) {
            try {
                Attention.backlight(true);
            } catch (e) {
                // The system's limit (BacklightOnTooLongException), or another refusal: the
                // frames go on, a press brings the display back.
            }
        }
        if (_shown >= GIVE_UP_MS) {
            _link.cancelPairing();
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            return;
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var radius = (width < height ? width : height) / 2;
        // Two markers and three cells of white across (1 + 6 + 1 + 6 + 1 = 15 cells): the
        // white square's corners on the round display's edge (inside a rectangular one);
        // below the subscreen where there is one, in the room left.
        var cell = (radius * Math.sqrt(2) / 15).toNumber();
        var centerY = height / 2;
        var subscreen = MarkerDraw.subscreen();
        if (subscreen != null) {
            var room = height - (subscreen[1] + subscreen[3]);
            cell = ((room < width ? room : width) * 0.9 / 15).toNumber();
            centerY = height - room / 2;
        }
        var side = 15 * cell;
        var left = width / 2 - side / 2;
        var top = centerY - side / 2;
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
        dc.fillRectangle(left, top, side, side);
        var ids = _frames[_frame];
        var places = [[1, 1], [8, 1], [1, 8], [8, 8]];
        for (var i = 0; i < 4; i++) {
            MarkerDraw.marker(dc, ids[i], left + places[i][0] * cell, top + places[i][1] * cell, cell);
        }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        // "Pairing" below the code, or in the subscreen.
        var labelX = subscreen != null ? subscreen[0] + subscreen[2] / 2 : width / 2;
        var labelY = subscreen != null ? subscreen[1] + subscreen[3] / 2 : (top + side + height / 2 + radius) / 2;
        dc.drawText(labelX, labelY, Graphics.FONT_XTINY, "Pairing", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        // Where the link stands, or what went wrong (Link.status), under the label: a
        // pairing that never completes says why.
        if (_link.status.length() > 0) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(labelX, labelY + dc.getFontHeight(Graphics.FONT_XTINY), Graphics.FONT_XTINY, _link.status,
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}

//! Back leaves pairing.
class PairingDelegate extends WatchUi.BehaviorDelegate {
    private var _link as Link;

    function initialize(link as Link) {
        BehaviorDelegate.initialize();
        _link = link;
    }

    function onBack() as Boolean {
        _link.cancelPairing();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        return true;
    }
}
