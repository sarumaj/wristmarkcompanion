import Toybox.Lang;

//! The control channel's messages as compact JSON, written and read here: they're
//! encrypted, so makeWebRequest's own encoding can't do it. Flat objects only, whose
//! values are strings, whole numbers and booleans, which is all the messages have
//! (docs/decisions/004-control-channel.md#messages).
module Json {
    //! A flat object as compact JSON, its keys in the order given (`keys`), as the
    //! viewer's JSON.stringify writes them.
    function write(object as Dictionary, keys as Array<String>) as String {
        var out = "{" as String;
        for (var i = 0; i < keys.size(); i++) {
            var value = object[keys[i]] as Object?;
            out += (i > 0 ? "," : "") + quote(keys[i]) + ":";
            if (value instanceof String) {
                out += quote(value);
            } else if (value instanceof Boolean) {
                out += value ? "true" : "false";
            } else if (value == null) {
                out += "null";
            } else {
                out += value.toString();
            }
        }
        return out + "}";
    }

    function quote(text as String) as String {
        var chars = text.toCharArray();
        var out = "\"";
        for (var i = 0; i < chars.size(); i++) {
            var c = chars[i];
            if (c == '"' || c == '\\') {
                out += "\\" + c.toString();
            } else if (c.toNumber() < 0x20) {
                out += " ";
            } else {
                out += c.toString();
            }
        }
        return out + "\"";
    }

    //! A flat object read from JSON, or null when it isn't one.
    function read(text as String) as Dictionary? {
        var chars = text.toCharArray();
        var at = skip(chars, 0);
        if (at >= chars.size() || chars[at] != '{') {
            return null;
        }
        var object = {};
        at = skip(chars, at + 1);
        if (at < chars.size() && chars[at] == '}') {
            return object;
        }
        while (at < chars.size()) {
            var key = string(chars, at);
            if (key == null) {
                return null;
            }
            at = skip(chars, key[1] as Number);
            if (at >= chars.size() || chars[at] != ':') {
                return null;
            }
            at = skip(chars, at + 1);
            var value = null;
            if (at < chars.size() && chars[at] == '"') {
                var parsed = string(chars, at);
                if (parsed == null) {
                    return null;
                }
                value = parsed[0];
                at = parsed[1] as Number;
            } else {
                var end = at;
                while (end < chars.size() && chars[end] != ',' && chars[end] != '}' && chars[end] != ' ') {
                    end++;
                }
                var word = text.substring(at, end) as String;
                if (word.equals("true")) {
                    value = true;
                } else if (word.equals("false")) {
                    value = false;
                } else {
                    value = word.toNumber();
                    if (value == null) {
                        return null;
                    }
                }
                at = end;
            }
            object[key[0]] = value;
            at = skip(chars, at);
            if (at < chars.size() && chars[at] == ',') {
                at = skip(chars, at + 1);
            } else if (at < chars.size() && chars[at] == '}') {
                return object;
            } else {
                return null;
            }
        }
        return null;
    }

    function skip(chars as Array<Char>, at as Number) as Number {
        while (at < chars.size() && (chars[at] == ' ' || chars[at] == '\n' || chars[at] == '\t' || chars[at] == '\r')) {
            at++;
        }
        return at;
    }

    //! The string starting at `at` (its opening quote) and where after it the text goes on.
    function string(chars as Array<Char>, at as Number) as Array? {
        if (at >= chars.size() || chars[at] != '"') {
            return null;
        }
        var out = "";
        for (var i = at + 1; i < chars.size(); i++) {
            var c = chars[i];
            if (c == '\\' && i + 1 < chars.size()) {
                i++;
                out += chars[i].toString();
            } else if (c == '"') {
                return [out, i + 1];
            } else {
                out += c.toString();
            }
        }
        return null;
    }
}
