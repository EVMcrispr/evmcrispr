import type { Err } from "arcsecond";

import type { NodeParserState } from "../types";

/** An end position (1-indexed line, 0-indexed col) used to emit a
 *  two-position parser error `Type(line:col,line:col): msg`, matching the
 *  range format that `NodeError` produces. When omitted, the single-position
 *  form `Type(line:col): msg` is emitted. */
export interface ParserErrorEnd {
  line: number;
  col: number;
}

export const buildParserError = (
  { data, error, index }: Err<string, NodeParserState>,
  type: string,
  msg?: string,
  end?: ParserErrorEnd,
): string => {
  // Only treat a trailing "got …" as the received value; the split is anchored
  // to the last "got " so messages that themselves contain the word "got"
  // (e.g. a custom `msg`) are not mangled.
  const gotIndex = error.lastIndexOf("got ");
  const wrongValueEncountered =
    gotIndex !== -1 ? error.slice(gotIndex + 4).trim() : null;

  const parserMsg = msg
    ? `${msg}${wrongValueEncountered ? `, got ${wrongValueEncountered}` : ""}`
    : error.split("): ")[1];

  const startCol = index - data.offset;
  const position = end
    ? `${data.line}:${startCol},${end.line}:${end.col}`
    : `${data.line}:${startCol}`;

  return `${type}(${position}): ${parserMsg}`;
};

export const getIncorrectReceivedValue = (errorMsg: string): string => {
  const splitRes = errorMsg.split("got ");

  if (splitRes.length === 2) {
    return `, got ${splitRes[1].trim()}`;
  }

  return "";
};
