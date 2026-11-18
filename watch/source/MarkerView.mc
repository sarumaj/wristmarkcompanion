import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

//! One marker of MarkerDictionary, as large as the display allows with the quiet zone
//! the detector needs (docs/watch.md#devices), and its ID below it: on a round display
//! its corners a cell inside the circle; on a rectangular one the shorter side; where a
//! small second display sits at the top (Instinct's subscreen), below it, the ID in it.
//! Only the markers the viewer has a model for are shown (MarkerContent).
class MarkerView extends WatchUi.View {
    //! How long each marker shows in the automatic cycle.
    private const CYCLE_MS = 5000;
    //! How often the display is asked to stay on. Garmin turns it off after its own
    //! timeout unless an app asks again; on AMOLED (burn-in protection) it refuses
    //! after about a minute held on (Attention.backlight, docs/watch.md).
    private const KEEP_ON_MS = 5000;

    //! Where in MarkerContent.IDS the shown marker is, and its ID.
    //! Where in MarkerContent.IDS the shown marker is; its size (one past the last) is
    //! the Viewers screen, between the last marker and the first, from where start or a
    //! tap opens the viewers' menu: a way to pairing no button setting of the watch takes.
    private var _index as Number = 0;
    private var _id as Number = MarkerContent.IDS[0];
    private var _cycling as Boolean = false;
    //! Whether the app still holds the display on; false after the system refused.
    private var _keepingOn as Boolean = true;
    //! Since when (seconds) the app has held the display in this session, and after how
    //! many seconds the system refused, shown below the ID until the next input
    //! (docs/watch.md#keeping-the-display-on): what the device tests read off the watch.
    private var _heldSince as Number? = null;
    private var _refusedAfter as Number? = null;
    private var _cycleTimer as Timer.Timer;
    private var _keepOnTimer as Timer.Timer;
    //! Called after the marker or the cycle changed, by a button or a viewer: the app
    //! tells the paired viewers (WristmarkApp.changed).
    var onChange as Method? = null;

    function initialize() {
        View.initialize();
        _cycleTimer = new Timer.Timer();
        _keepOnTimer = new Timer.Timer();
    }

    function onShow() as Void {
        _keepOnTimer.start(method(:keepOn), KEEP_ON_MS, true);
        wake();
    }

    function onHide() as Void {
        _keepOnTimer.stop();
        _cycleTimer.stop();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight();
        if (onViewers()) {
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
            dc.clear();
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(width / 2, height / 2 - dc.getFontHeight(Graphics.FONT_MEDIUM) / 2, Graphics.FONT_MEDIUM,
                "Viewers", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.drawText(width / 2, height / 2 + dc.getFontHeight(Graphics.FONT_XTINY), Graphics.FONT_XTINY,
                "Start or tap: pair", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }
        var cells = MarkerDictionary.SIZE + 2;
        var font = Graphics.FONT_XTINY;
        var line = dc.getFontHeight(font);
        var centerY = height / 2;
        var cell;
        // Where the ID goes: x, y.
        var labelY;
        var subscreen = MarkerDraw.subscreen();
        if (subscreen != null) {
            // Below the subscreen, in the room left; the display's cut corners cost a
            // little more than a round one's, hence the margin of two cells.
            var room = height - (subscreen[1] + subscreen[3]);
            var shorter = room < width ? room : width;
            cell = shorter / (cells + 4);
            centerY = height - room / 2;
            labelY = subscreen[1] + subscreen[3] / 2;
        } else if (System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_RECTANGLE) {
            // The marker and its quiet zone in the shorter side, a line for the ID below.
            var room = height - line;
            var shorter = room < width ? room : width;
            cell = shorter / (cells + 2);
            centerY = room / 2;
            labelY = centerY + (cells / 2 + 1) * cell + line / 2;
        } else {
            // Round (and semi-round): the largest whole cell for which the marker's
            // corners stay a cell inside the circle: side s = 6 cells, s / sqrt(2) +
            // cell <= radius.
            var radius = (width < height ? width : height) / 2;
            cell = (radius / (cells / Math.sqrt(2) + 1.0)).toNumber();
            labelY = (height / 2 + (cells / 2 + 1) * cell + height / 2 + radius) / 2;
        }
        var side = cells * cell;
        var left = width / 2 - side / 2;
        var top = centerY - side / 2;

        // Black everywhere but the quiet zone: few lit pixels on an AMOLED display.
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        // The quiet zone, a cell of white around the marker; its own corners fall
        // outside the round display, the marker's stay a cell inside.
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
        dc.fillRectangle(left - cell, top - cell, side + 2 * cell, side + 2 * cell);

        // The black border and the code's black cells.
        MarkerDraw.marker(dc, _id, left, top, cell);

        // The ID outside the quiet zone, where the detector doesn't look.
        var labelX = subscreen != null ? subscreen[0] + subscreen[2] / 2 : width / 2;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(labelX, labelY, font,
            (_cycling ? "auto " : "") + "ID " + _id + (_refusedAfter != null ? " - lit " + _refusedAfter + "s" : ""),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! The next (1) or previous (-1) marker, the Viewers screen between the last and the first.
    function step(delta as Number) as Void {
        var places = MarkerContent.IDS.size() + 1;
        _index = (_index + delta + places) % places;
        if (!onViewers()) {
            _id = MarkerContent.IDS[_index];
        }
        changed();
    }

    //! Whether the Viewers screen shows, not a marker.
    function onViewers() as Boolean {
        return _index == MarkerContent.IDS.size();
    }

    //! Marker `id`, if the viewer has a model for it (a viewer asked: `show`).
    function showId(id as Number) as Void {
        var index = MarkerContent.IDS.indexOf(id);
        if (index < 0) {
            return;
        }
        _index = index;
        _id = id;
        changed();
    }

    //! Starts or stops the automatic cycle through the markers.
    function toggleCycle() as Void {
        setCycle(!_cycling);
    }

    function setCycle(on as Boolean) as Void {
        _cycling = on;
        if (_cycling) {
            _cycleTimer.start(method(:cycle), CYCLE_MS, true);
        } else {
            _cycleTimer.stop();
        }
        changed();
    }

    //! What the viewers are told: the marker shown and whether it cycles.
    function shown() as Number {
        return _id;
    }

    function cycling() as Boolean {
        return _cycling;
    }

    private function changed() as Void {
        wake();
        WatchUi.requestUpdate();
        if (onChange != null) {
            onChange.invoke();
        }
    }

    function cycle() as Void {
        // The cycle goes through the markers only; from the Viewers screen to the first.
        var count = MarkerContent.IDS.size();
        _index = (_index + 1) % (count + 1) % count;
        _id = MarkerContent.IDS[_index];
        WatchUi.requestUpdate();
        if (onChange != null) {
            onChange.invoke();
        }
    }

    //! The user acted: hold the display on again, also after the system refused.
    function wake() as Void {
        _keepingOn = true;
        _heldSince = null;
        _refusedAfter = null;
        keepOn();
    }

    //! Asks for the display to stay on, until the system refuses (burn-in protection).
    function keepOn() as Void {
        if (!_keepingOn || !(Attention has :backlight)) {
            return;
        }
        var now = Time.now().value();
        try {
            Attention.backlight(true);
            if (_heldSince == null) {
                _heldSince = now;
            }
        } catch (e instanceof Attention.BacklightOnTooLongException) {
            refused(now);
        } catch (e) {
            // Any other refusal: never let it end the app (an uncaught exception closes
            // it, back to the watch face, where start opens the watch's own timer).
            refused(now);
        }
    }

    private function refused(now as Number) as Void {
        _keepingOn = false;
        _refusedAfter = _heldSince != null ? now - (_heldSince as Number) : 0;
        WatchUi.requestUpdate();
    }
}
