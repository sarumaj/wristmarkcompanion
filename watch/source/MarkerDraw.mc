import Toybox.Graphics;
import Toybox.Lang;

//! Draws markers of MarkerDictionary: the single marker of MarkerView and the four of a
//! pairing frame (PairingView).
module MarkerDraw {
    //! Marker `id` with its top left corner at (left, top), `cell` pixels a cell: its
    //! black border and black data cells, over the white the caller has filled (the
    //! quiet zone). Bit 15 of a code is the top left data cell, row by row; 1 is white.
    function marker(dc as Graphics.Dc, id as Number, left as Number, top as Number, cell as Number) as Void {
        var cells = MarkerDictionary.SIZE + 2;
        var data = MarkerDictionary.SIZE;
        var code = MarkerDictionary.CODES[id];
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_WHITE);
        for (var row = 0; row < cells; row++) {
            for (var col = 0; col < cells; col++) {
                var border = row == 0 || col == 0 || row == cells - 1 || col == cells - 1;
                if (border || ((code >> (data * data - 1 - ((row - 1) * data + (col - 1)))) & 1) == 0) {
                    dc.fillRectangle(left + col * cell, top + row * cell, cell, cell);
                }
            }
        }
    }
}
