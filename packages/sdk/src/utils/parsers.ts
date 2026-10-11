import type { Err } from "arcsecond";
import {
  everyCharUntil as everyByteUntil,
  Parser,
  updateError,
  updateParserState,
} from "arcsecond";

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

/** The input of a parse as text, with where each of its bytes falls in it:
 *  arcsecond keeps its place in bytes, a regular expression in UTF-16. */
interface InputText {
  text: string;
  /** Byte offset → index in `text` of the character it is in. */
  charAt: Uint32Array;
  /** Byte offset → how many bytes of its character are left from it, when
   *  it falls inside one; 0 where a character starts. */
  inside: Uint8Array;
}

const inputTexts = new WeakMap<DataView, InputText>();
// A byte order mark stays in the text wherever it is: `regex` decides
// what to do with one, below.
const inputDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
const inputEncoder = new TextEncoder();
const BYTE_ORDER_MARK = "\uFEFF";
const REPLACEMENT = "\uFFFD";

const inputText = (dataView: DataView): InputText => {
  let input = inputTexts.get(dataView);
  if (input) return input;
  const text = inputDecoder.decode(dataView);
  const charAt = new Uint32Array(dataView.byteLength + 1);
  const inside = new Uint8Array(dataView.byteLength + 1);
  let byte = 0;
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i) as number;
    const bytes = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    for (let b = 0; b < bytes; b++) {
      charAt[byte + b] = i;
      inside[byte + b] = b === 0 ? 0 : bytes - b;
    }
    byte += bytes;
    i += code > 0xffff ? 2 : 1;
  }
  charAt[byte] = text.length;
  input = { text, charAt, inside };
  inputTexts.set(dataView, input);
  return input;
};

/** What decoding the input from byte `index` to its end gives, as
 *  arcsecond's `regex` reads it: the bytes left of a character entered in
 *  its middle are each a replacement character, and a byte order mark
 *  right at `index` is dropped. */
const restFrom = ({ text, charAt, inside }: InputText, index: number) => {
  const left = inside[index];
  if (left) return REPLACEMENT.repeat(left) + text.slice(charAt[index + left]);
  const at = charAt[index];
  return text.slice(text[at] === BYTE_ORDER_MARK ? at + 1 : at);
};

/**
 * arcsecond's `regex`, reading the input once per parse.
 *
 * arcsecond's own decodes everything from the current position to the end
 * of the input on every attempt, byte by byte, which makes a parse
 * quadratic in the length of its input. This one takes the same text out
 * of the input decoded once: what it matches, how far it moves and what it
 * reports are the same at every position, the ones inside a character
 * included (`everythingUntil` tries its end at each byte).
 */
export function regex(re: RegExp): Parser<string> {
  if (re.toString()[1] !== "^")
    throw new Error("regex parsers must contain '^' start assertion.");

  return new Parser((state) => {
    if (state.isError) return state;
    const { dataView, index } = state;
    const rest = restFrom(inputText(dataView), index);

    if (rest.length >= 1) {
      const match = rest.match(re);
      return match
        ? updateParserState(
            state,
            match[0],
            index + inputEncoder.encode(match[0]).byteLength,
          )
        : updateError(
            state,
            `ParseError (position ${index}): Expecting string matching '${re}', got '${rest.slice(
              0,
              5,
            )}...'`,
          );
    }
    return updateError(
      state,
      `ParseError (position ${index}): Expecting string matching '${re}', but got end of input.`,
    );
  });
}

/**
 * arcsecond's `everyCharUntil`, trying `end` once per character.
 *
 * arcsecond's own moves a byte at a time and tries `end` at each, the
 * ones inside a character included, where a `regex` has to put together
 * the text it reads. An `end` never matches there (what it would read
 * opens with a replacement character), so this one moves a character at a
 * time: it stops where arcsecond's does. `end` is only looked for: what it
 * consumes or writes to the state is dropped.
 */
export function everyCharUntil(end: Parser<any>): Parser<string> {
  const byBytes = everyByteUntil(end);

  return new Parser((state) => {
    if (state.isError) return state;
    const { dataView, index: from } = state;
    const { text, charAt, inside } = inputText(dataView);
    // Entered inside a character: arcsecond's own way, byte by byte.
    if (inside[from]) return byBytes.p(state);

    let index = from;
    while (true) {
      const at = updateParserState(state, state.result, index);
      if (!end.p(at).isError) break;
      if (index >= dataView.byteLength)
        return updateError(
          at,
          `ParseError 'everythingUntil' (position ${index}): Unexpected end of input.`,
        );
      do index++;
      while (inside[index]);
    }
    return updateParserState(
      state,
      text.slice(charAt[from], charAt[index]),
      index,
    );
  });
}

/** arcsecond's `digits`, on the `regex` above. */
export const digits: Parser<string> = regex(/^[0-9]+/).errorMap(
  ({ index }) => `ParseError (position ${index}): Expecting digits`,
);
