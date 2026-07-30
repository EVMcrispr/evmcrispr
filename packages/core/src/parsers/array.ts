import type { ArrayExpressionNode, NodeParser } from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import {
  char,
  coroutine,
  lookAhead,
  possibly,
  recursiveParser,
} from "arcsecond";
import { argumentExpressionParser } from "./expression";
import { namedArgParser } from "./namedArg";

import {
  createNodeLocation,
  locate,
  optionalMultilineWhitespace,
} from "./utils";

export const ARRAY_PARSER_ERROR = "ArrayParserError";

export const arrayExpressionParser: NodeParser<ArrayExpressionNode> =
  recursiveParser(() =>
    locate<ArrayExpressionNode>(
      coroutine((run) => {
        run(char("["));
        run(optionalMultilineWhitespace);

        const elements: ArrayExpressionNode["elements"] = [];
        while (!run(possibly(lookAhead(char("]"))))) {
          // `name:value` record entries — tried before the regular element
          // parsers so `a:1` doesn't get swallowed as a bareword.
          const elem =
            run(possibly(namedArgParser([char("]")]))) ??
            run(possibly(argumentExpressionParser([char("]")])));
          if (elem === null) break;
          elements.push(elem as ArrayExpressionNode["elements"][number]);
          run(optionalMultilineWhitespace);
        }

        run(char("]"));
        return [elements];
      }).errorMap((err) =>
        buildParserError(
          err,
          ARRAY_PARSER_ERROR,
          'Expected "]" to close the array',
        ),
      ),
      ({
        data: { line, offset },
        index,
        result: [initialContext, [elements]],
      }) => ({
        type: NodeType.ArrayExpression,
        elements: elements as ArrayExpressionNode["elements"],
        loc: createNodeLocation(initialContext, { index, line, offset }),
      }),
    ),
  );
