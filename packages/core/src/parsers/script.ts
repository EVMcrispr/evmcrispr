import type { CommandExpressionNode, NodeParserState } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Parser } from "arcsecond";
import { coroutine, setData } from "arcsecond";
import { EvmlAST } from "../EvmlAST";
import { commandExpressionParser } from "./command";
import { createParserState, linesParser } from "./utils";

export const scriptParser: Parser<EvmlAST, string, NodeParserState> = coroutine(
  (run) => {
    run(setData<any, string, NodeParserState>(createParserState()));
    const lines: CommandExpressionNode[] = run(
      linesParser(commandExpressionParser),
    );
    return new EvmlAST(lines);
  },
);

const ERROR_POSITION_RE = /^\w+\((\d+):(\d+)/;
const COMMA_HINT =
  "arguments are space-separated in EVML; remove the comma (commas only belong inside quoted strings)";

/** Newcomers separate arguments with commas (`@get(a, b)`, `[1, 2]`); the
 *  resulting errors point at the failing token, not the comma, so a generic
 *  "expected a value" message hides the actual mistake. When the token at an
 *  error's position contains a bare comma, append a targeted hint. Quoted
 *  tokens are exempt — commas are legal inside strings, and an unclosed
 *  quote is a different mistake. */
const withCommaHint = (script: string) => {
  // Split once for all the errors of a script, and only if it has any.
  let lines: string[] | undefined;
  return (error: string): string => {
    const m = error.match(ERROR_POSITION_RE);
    if (!m) return error;
    lines ??= script.split(/\r?\n/);
    const line = lines[Number(m[1]) - 1] ?? "";
    const token = line.slice(Number(m[2])).match(/^\S*/)?.[0] ?? "";
    if (!token.includes(",") || /^["']/.test(token)) return error;
    return `${error} — ${COMMA_HINT}`;
  };
};

/** The scripts parsed last, by their text. A keystroke has the same text
 *  parsed by every tool that reads it (diagnostics, hover, completions,
 *  auto-import): they share one tree, which none of them writes to. */
const parsed = new Map<string, { ast: EvmlAST; errors: string[] }>();
const PARSED_KEPT = 8;

export const parseScript = (
  script: string,
): { ast: EvmlAST; errors: string[] } => {
  const known = parsed.get(script);
  if (known) return { ast: known.ast, errors: [...known.errors] };

  const res = scriptParser.run(script);

  if (res.isError) {
    throw new ErrorException(
      `An error occurred while parsing script: ${res.error}`,
    );
  }

  const result = {
    ast: res.result,
    errors: res.data.errors.map(withCommaHint(script)),
  };
  if (parsed.size >= PARSED_KEPT)
    parsed.delete(parsed.keys().next().value as string);
  parsed.set(script, result);
  return { ast: result.ast, errors: [...result.errors] };
};
