import { parseScript } from "./parsers/script";

export type ParseDiagnostic = {
  /** 1-indexed line number. */
  line: number;
  /** 0-indexed column offset. */
  col: number;
  message: string;
  severity: "error" | "warning";
};

/** Extract structured data from a parser error string.
 *  Format produced by `buildParserError`: `Type(line:col): message` */
export function parseDiagnosticString(error: string): ParseDiagnostic | null {
  const match = error.match(/^\w+\((\d+):(\d+)\):\s*(.+)$/);
  if (!match) return null;
  return {
    line: Number(match[1]),
    col: Number(match[2]),
    message: match[3],
    severity: "error",
  };
}

/** Return parse diagnostics (errors) for the given script.
 *  Synchronous; never throws. */
export function getDiagnostics(script: string): ParseDiagnostic[] {
  try {
    const { errors } = parseScript(script);
    return errors
      .map(parseDiagnosticString)
      .filter((d): d is ParseDiagnostic => d !== null);
  } catch {
    return [];
  }
}
