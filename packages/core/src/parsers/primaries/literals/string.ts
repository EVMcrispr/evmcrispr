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

export const stringParser: EnclosingNodeParser<StringLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<StringLiteralNode>(
    coroutine((run) => {
      const value: string = run(
        choice<any, any>([
          between(char('"'))(char('"'))(regex(/^[^"]*/)),
          between(char("'"))(char("'"))(regex(/^[^']*/)),
        ]),
      );

      /**
       * Strings may span multiple lines (the regex above already accepts
       * `\n`). Whenever the matched content contains newlines, advance
       * `state.line` and reset `state.offset` so subsequent `loc`s remain
       * correct. `currentContexDataParser` gives us the absolute parser
       * index right after the closing quote.
       */
      const newlineCount = (value.match(/\n/g) || []).length;
      if (newlineCount > 0) {
        const ctx = run(currentContexDataParser);
        const contentStart = ctx!.index - 1 - value.length;
        const newOffset = contentStart + value.lastIndexOf("\n") + 1;
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
      return [value];
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
