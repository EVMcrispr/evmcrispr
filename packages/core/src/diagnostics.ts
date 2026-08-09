import { parseScript } from "./parsers/script";

export type ParseDiagnostic = {
  /** 1-indexed line number (start). */
  line: number;
  /** 0-indexed column offset (start). */
  col: number;
  /** 1-indexed line number of the end of the range, when known. */
  endLine?: number;
  /** 0-indexed column offset of the end of the range, when known. */
  endCol?: number;
  message: string;
  severity: "error" | "warning";
  /** Stable machine-readable slug, e.g. `command-parser` or `unknown-command`. */
  code?: string;
  /** Which phase produced the diagnostic. */
  source?: "parser" | "semantic";
};

/** Turn a parser error `type` label (`CommandParserError`) into a stable,
 *  kebab-cased diagnostic `code` (`command-parser`). */
function typeToCode(type: string): string {
  return type
    .replace(/Error$/, "")
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/** Extract structured data from a parser error string. Format produced by
 *  `buildParserError`: `Type(line:col): message` or, when a range is known,
 *  `Type(line:col,line:col): message`. */
export function parseDiagnosticString(error: string): ParseDiagnostic | null {
  const match = error.match(/^(\w+)\((\d+):(\d+)(?:,(\d+):(\d+))?\):\s*(.+)$/s);
  if (!match) return null;
  const [, type, line, col, endLine, endCol, message] = match;
  return {
    line: Number(line),
    col: Number(col),
    ...(endLine !== undefined
      ? { endLine: Number(endLine), endCol: Number(endCol) }
      : {}),
    message,
    severity: "error",
    code: typeToCode(type),
    source: "parser",
  };
}

/** Append a hint when a parse error sits on or right before a comma — the
 *  most common EVML mistake is comma-separating arguments or array
 *  elements, which the generic expression error does not explain. */
function withCommaHint(d: ParseDiagnostic, lines: string[]): ParseDiagnostic {
  if (d.source !== "parser") return d;
  const rest = lines[d.line - 1]?.slice(d.col) ?? "";
  // Token from the error column to the next whitespace or closer.
  const token = rest.match(/^[^\s)\]]*/)?.[0] ?? "";
  if (!token.includes(",") && !rest.trimStart().startsWith(",")) return d;
  return {
    ...d,
    message: `${d.message}. Did you separate arguments with commas? EVML arguments are space-separated, e.g. @balance(DAI @me) or [1 2 3]`,
  };
}

/** Return parse diagnostics (errors) for the given script.
 *  Synchronous; never throws. */
export function getDiagnostics(script: string): ParseDiagnostic[] {
  try {
    const { errors } = parseScript(script);
    const lines = script.split("\n");
    return errors
      .map(parseDiagnosticString)
      .filter((d): d is ParseDiagnostic => d !== null)
      .map((d) => withCommaHint(d, lines));
  } catch {
    return [];
  }
}
