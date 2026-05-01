import type {
  EnclosingNodeParser,
  NodeParserState,
  StringLiteralNode,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import {
  between,
  char,
  choice,
  coroutine,
  getData,
  regex,
  setData,
} from "arcsecond";
import {
  createNodeLocation,
  currentContexDataParser,
  enclosingLookaheadParser,
  locate,
} from "../../utils";

export const STRING_PARSER_ERROR = "StringParserError";

/**
 * Recognized backslash escapes inside string literals. Anything not
 * matched by this regex is left as-is in the resulting value (lenient
 * mode), so a script with e.g. `"C:\Users"` keeps working unchanged.
 */
const ESCAPE_RE = /\\(u\{([0-9A-Fa-f]+)\}|['"\\nrt])/g;

const unescapeStringLiteral = (raw: string): string =>
  raw.replace(ESCAPE_RE, (_match, esc: string, hex?: string) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    switch (esc) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return esc;
    }
  });

export const stringParser: EnclosingNodeParser<StringLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<StringLiteralNode>(
    coroutine((run) => {
      const raw: string = run(
        choice<any, any>([
          between(char('"'))(char('"'))(regex(/^(?:[^"\\]|\\[\s\S])*/)),
          between(char("'"))(char("'"))(regex(/^(?:[^'\\]|\\[\s\S])*/)),
        ]),
      );

      /**
       * Strings may span multiple lines (the regex above already accepts
       * `\n`). Whenever the matched content contains newlines, advance
       * `state.line` and reset `state.offset` so subsequent `loc`s remain
       * correct. `currentContexDataParser` gives us the absolute parser
       * index right after the closing quote. Bookkeeping uses the raw
       * source slice (not the unescaped value) so escape sequences like
       * `\n` don't bump `state.line`.
       */
      const newlineCount = (raw.match(/\n/g) || []).length;
      if (newlineCount > 0) {
        const ctx = run(currentContexDataParser);
        const contentStart = ctx!.index - 1 - raw.length;
        const newOffset = contentStart + raw.lastIndexOf("\n") + 1;
        run(
          getData.chain<any>((state: NodeParserState) =>
            setData<any, string, NodeParserState>({
              ...state,
              line: state.line + newlineCount,
              offset: newOffset,
            }),
          ),
        );
      }

      run(enclosingLookaheadParser(enclosingParsers));
      return [unescapeStringLiteral(raw)];
    }).errorMap((err) =>
      buildParserError(err, STRING_PARSER_ERROR, "Expecting a quoted string"),
    ),
    ({ data, index, result: [initialContext, [value]] }) => {
      return {
        type: NodeType.StringLiteral,
        value: value as StringLiteralNode["value"],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      };
    },
  );
