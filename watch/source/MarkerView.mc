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
//! Only the markers the viewer has a model for are shown (MarkerContent); after the
//! last, the Viewers screen (drawViewers).
class MarkerView extends WatchUi.View {
    //! How long each marker shows in the automatic cycle.
    private const CYCLE_MS = 5000;
    //! How often the display is asked to stay on. Garmin turns it off after its own
    //! timeout unless an app asks again; on AMOLED (burn-in protection) it refuses
    //! after about a minute held on (Attention.backlight, docs/watch.md).
    private const KEEP_ON_MS = 5000;

    //! Where in MarkerContent.IDS the shown marker is; its size (one past the last) is
    //! the Viewers screen, between the last marker and the first: the QR code of the
    //! viewer's address, and from there start or a tap opens the viewers' menu, a way to
    //! pairing no button setting of the watch takes.
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
        if (onViewers()) {
            drawViewers(dc);
            return;
        }
        var width = dc.getWidth();
        var cells = MarkerDictionary.SIZE + 2;
        var font = Graphics.FONT_XTINY;
        var box = layout(dc, cells, 1, dc.getFontHeight(font));
        var cell = box[0];
        var centerY = box[1];
        var labelY = box[2];
        var subscreen = MarkerDraw.subscreen();
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

    //! Where a square code of `cells` cells a side goes, with `quiet` cells of white
    //! around it, and a line of text `line` pixels high: [cell, center y, the text's y].
    //! On a round display the largest whole cell for which the code's corners stay
    //! `quiet` cells inside the circle (side s: s / sqrt(2) + quiet cells <= radius),
    //! the white's own corners falling outside, the text in the room below; on a
    //! rectangular one the shorter side, the text below; where a small second display
    //! sits at the top (Instinct's subscreen), below it, the text in it.
    private function layout(dc as Graphics.Dc, cells as Number, quiet as Number, line as Number) as Array<Number> {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var subscreen = MarkerDraw.subscreen();
        if (subscreen != null) {
            // The display's cut corners cost a little more than a round one's, hence
            // the margin of a cell more on each side.
            var room = height - (subscreen[1] + subscreen[3]);
            var shorter = room < width ? room : width;
            return [shorter / (cells + 2 * quiet + 2), height - room / 2, subscreen[1] + subscreen[3] / 2] as Array<Number>;
        }
        if (System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_RECTANGLE) {
            var room = height - line;
            var shorter = room < width ? room : width;
            var cell = shorter / (cells + 2 * quiet);
            return [cell, room / 2, room / 2 + (cells * cell) / 2 + quiet * cell + line / 2] as Array<Number>;
        }
        var radius = (width < height ? width : height) / 2;
        var cell = (radius / (cells / Math.sqrt(2) + quiet)).toNumber();
        var below = height / 2 + (cells * cell) / 2 + quiet * cell;
        return [cell, height / 2, (below + height / 2 + radius) / 2] as Array<Number>;
    }

    //! The Viewers screen: the QR code of the viewer's address (ViewerQr), for a phone's
    //! camera, and how to pair (start or a tap: the viewers' menu).
    private function drawViewers(dc as Graphics.Dc) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var font = Graphics.FONT_XTINY;
        var size = ViewerQr.SIZE;
        // Two modules of white around it: the readers' quiet zone, smaller than the
        // standard's four, as phones read it (and more modules for the code).
        var quiet = 2;
        var box = layout(dc, size, quiet, dc.getFontHeight(font));
        var cell = box[0];
        var side = size * cell;
        var left = width / 2 - side / 2;
        var top = box[1] - side / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
        dc.fillRectangle(left - quiet * cell, top - quiet * cell, side + 2 * quiet * cell, side + 2 * quiet * cell);
        // The dark modules, a rectangle per run of them in a row.
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_WHITE);
        for (var row = 0; row < size; row++) {
            var bits = ViewerQr.ROWS[row];
            var col = 0;
            while (col < size) {
                if (((bits >> (size - 1 - col)) & 1) == 0) {
                    col++;
                    continue;
                }
                var start = col;
                while (col < size && ((bits >> (size - 1 - col)) & 1) == 1) {
                    col++;
                }
                dc.fillRectangle(left + start * cell, top + row * cell, (col - start) * cell, cell);
            }
        }

        var subscreen = MarkerDraw.subscreen();
        var labelX = subscreen != null ? subscreen[0] + subscreen[2] / 2 : width / 2;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(labelX, box[2], font, "Start: pair", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        // On a round display the room above the code names it.
        if (subscreen == null && System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_RECTANGLE) {
            dc.drawText(width / 2, height - box[2], font, "Viewer", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
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
