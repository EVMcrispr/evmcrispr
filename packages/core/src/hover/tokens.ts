// ---------------------------------------------------------------------------
// Hover token detection
// ---------------------------------------------------------------------------

export type TokenKind =
  | "address"
  | "helper"
  | "variable"
  | "option"
  | "identifier";

export interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

/**
 * Note: the address pattern is listed first so that a 0x... literal is
 * recognised as an address rather than falling into the catch-all
 * identifier match.
 */
const TOKEN_RE =
  /0x[a-fA-F0-9]{40}\b|@(?:[\w-]+:)?[\w.]+|\$[\w]+|--[\w-]+|[\w:-]+/g;

export function getTokenAtCol(lineText: string, col: number): Token | null {
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (col >= start && col < end) {
      const value = match[0];
      let kind: TokenKind = "identifier";
      if (/^0x[a-fA-F0-9]{40}$/.test(value)) kind = "address";
      else if (value.startsWith("@")) kind = "helper";
      else if (value.startsWith("$")) kind = "variable";
      else if (value.startsWith("--")) kind = "option";
      return { kind, value, start, end };
    }
  }
  return null;
}
