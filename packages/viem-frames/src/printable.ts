/**
 * Text from a request, a wallet, a gateway or a node, safe to write to a
 * terminal or a log: C0 and C1 controls (ESC, CR, LF among them), DEL and
 * bidirectional controls (U+061C, U+200E/F, U+202A-E, U+2066-9) become
 * visible escapes, so a field cannot redraw or hide what is around it.
 * With `max`, cut to that many characters (before escaping) and marked "…".
 */
export function printable(value: unknown, max?: number): string {
  const text = String(value);
  const cut = max !== undefined && text.length > max;
  const shown = (cut ? text.slice(0, max) : text).replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the point
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    (c) => {
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      if (c === "\t") return "\\t";
      const code = c.charCodeAt(0);
      return code <= 0xff
        ? `\\x${code.toString(16).padStart(2, "0")}`
        : `\\u${code.toString(16).padStart(4, "0")}`;
    },
  );
  return cut ? `${shown}…` : shown;
}
