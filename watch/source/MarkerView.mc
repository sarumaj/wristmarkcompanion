import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Timer;
import Toybox.WatchUi;

//! One marker of MarkerDictionary, as large as the round display allows with the
//! quiet zone the detector needs (docs/watch.md), and its ID below it. Only the
//! markers the viewer has a model for are shown (MarkerContent).
class MarkerView extends WatchUi.View {
    //! How long each marker shows in the automatic cycle.
    private const CYCLE_MS = 5000;
    //! How often the display is asked to stay on. Garmin turns it off after its own
    //! timeout unless an app asks again; on AMOLED (burn-in protection) it refuses
    //! after about a minute held on (Attention.backlight, docs/watch.md).
    private const KEEP_ON_MS = 5000;

    //! Where in MarkerContent.IDS the shown marker is, and its ID.
    private var _index as Number = 0;
    private var _id as Number = MarkerContent.IDS[0];
    private var _cycling as Boolean = false;
    //! Whether the app still holds the display on; false after the system refused.
    private var _keepingOn as Boolean = true;
    private var _cycleTimer as Timer.Timer;
    private var _keepOnTimer as Timer.Timer;

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
        var radius = (width < height ? width : height) / 2;
        // The largest whole cell for which the marker's corners stay a cell inside
        // the round display: side s = 6 cells, s / sqrt(2) + cell <= radius.
        var cells = MarkerDictionary.SIZE + 2;
        var cell = (radius / (cells / Math.sqrt(2) + 1.0)).toNumber();
        var side = cells * cell;
        var left = width / 2 - side / 2;
        var top = height / 2 - side / 2;

        // Black everywhere but the quiet zone: few lit pixels on an AMOLED display.
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        // The quiet zone, a cell of white around the marker; its own corners fall
        // outside the round display, the marker's stay a cell inside.
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_WHITE);
        dc.fillRectangle(left - cell, top - cell, side + 2 * cell, side + 2 * cell);

        // The black border and the code's black cells: bit 15 is the top left data
        // cell, row by row; 1 is white (MarkerDictionary).
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_WHITE);
        var code = MarkerDictionary.CODES[_id];
        var data = MarkerDictionary.SIZE;
        for (var row = 0; row < cells; row++) {
            for (var col = 0; col < cells; col++) {
                var border = row == 0 || col == 0 || row == cells - 1 || col == cells - 1;
                if (border || ((code >> (data * data - 1 - ((row - 1) * data + (col - 1)))) & 1) == 0) {
                    dc.fillRectangle(left + col * cell, top + row * cell, cell, cell);
                }
            }
        }

        // The ID below the quiet zone, outside what the detector looks at.
        var below = top + side + cell;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(width / 2, (below + height / 2 + radius) / 2, Graphics.FONT_XTINY,
            (_cycling ? "auto " : "") + "ID " + _id, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! The next (1) or previous (-1) marker.
    function step(delta as Number) as Void {
        var count = MarkerContent.IDS.size();
        _index = (_index + delta + count) % count;
        _id = MarkerContent.IDS[_index];
        wake();
        WatchUi.requestUpdate();
    }

    //! Starts or stops the automatic cycle through the markers.
    function toggleCycle() as Void {
        _cycling = !_cycling;
        if (_cycling) {
            _cycleTimer.start(method(:cycle), CYCLE_MS, true);
        } else {
            _cycleTimer.stop();
        }
        wake();
        WatchUi.requestUpdate();
    }

    function cycle() as Void {
        var count = MarkerContent.IDS.size();
        _index = (_index + 1) % count;
        _id = MarkerContent.IDS[_index];
        WatchUi.requestUpdate();
    }

    //! The user acted: hold the display on again, also after the system refused.
    function wake() as Void {
        _keepingOn = true;
        keepOn();
    }

    //! Asks for the display to stay on, until the system refuses (burn-in protection).
    function keepOn() as Void {
        if (!_keepingOn || !(Attention has :backlight)) {
            return;
        }
        try {
            Attention.backlight(true);
        } catch (e instanceof Attention.BacklightOnTooLongException) {
            _keepingOn = false;
        }
    }
}
