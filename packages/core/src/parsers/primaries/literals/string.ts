import type { EnclosingNodeParser, StringLiteralNode } from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import { between, char, choice, regex, sequenceOf } from "arcsecond";
import {
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
} from "../../utils";

export const STRING_PARSER_ERROR = "StringParserError";

export const stringParser: EnclosingNodeParser<StringLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<StringLiteralNode>(
    sequenceOf([
      choice<any, any>([
        between(char('"'))(char('"'))(regex(/^[^"]*/)),
        between(char("'"))(char("'"))(regex(/^[^']*/)),
      ]),
      enclosingLookaheadParser(enclosingParsers),
    ])
      .map(([x]) => [x])
      .errorMap((err) =>
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
