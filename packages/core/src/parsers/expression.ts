import type {
  ArgumentExpressionNode,
  BarewordNode,
  CommandArgExpressionNode,
  EnclosingNodeParser,
  NodeParser,
} from "@evmcrispr/sdk";
import { getIncorrectReceivedValue, NodeType } from "@evmcrispr/sdk";
import {
  char,
  choice,
  coroutine,
  lookAhead,
  possibly,
  recursiveParser,
} from "arcsecond";
import { arrayExpressionParser } from "./array";
import { blockExpressionParser } from "./block";

import { callExpressionParser } from "./call";
import { destructurePatternParser } from "./destructure";
import { helperFunctionParser } from "./helper";
import {
  barewordParser,
  primaryParser,
  variableIdentifierParser,
} from "./primaries";
import {
  createNodeLocation,
  locate,
  openingCharParser,
  optionalWhitespace,
} from "./utils";

export const argumentExpressionParser: EnclosingNodeParser<
  ArgumentExpressionNode
> = (enclosingParsers = []) =>
  recursiveParser(() =>
    choice([
      callExpressionParser,
      helperFunctionParser,
      destructurePatternParser,
      arrayExpressionParser,
      primaryParser(enclosingParsers),
      variableIdentifierParser(enclosingParsers),
      barewordParser(enclosingParsers),
    ]).errorMap(({ data, error, index }) => {
      return `ExpressionParserError(${data.line},${
        index - data.offset
      }): Expecting a valid expression${getIncorrectReceivedValue(error)}`;
    }),
  );

export const expressionParser: EnclosingNodeParser<CommandArgExpressionNode> = (
  enclosingParsers = [],
) =>
  recursiveParser(() =>
    choice([
      callExpressionParser,
      helperFunctionParser,
      blockExpressionParser,
      destructurePatternParser,
      arrayExpressionParser,
      primaryParser(enclosingParsers),
      variableIdentifierParser(enclosingParsers),
      barewordParser(enclosingParsers),
    ]).errorMap(({ data, error, index }) => {
      return `ExpressionParserError(${data.line},${
        index - data.offset
      }): Expecting a valid expression${getIncorrectReceivedValue(error)}`;
    }),
  );

const parenToken = (c: "(" | ")") =>
  recursiveParser(() =>
    locate<BarewordNode>(
      char(c).map((v) => [v]),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.Bareword,
        value: value as string,
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );

export const argumentsParser: NodeParser<ArgumentExpressionNode[]> =
  recursiveParser(() =>
    coroutine((run) => {
      run(openingCharParser("("));

      const results: ArgumentExpressionNode[] = [];
      let depth = 0;

      if (run(possibly(char(")")))) return results;

      while (true) {
        const lp = run(possibly(parenToken("(")));
        if (lp) {
          results.push(lp);
          depth++;
          run(optionalWhitespace);
          continue;
        }

        if (run(possibly(lookAhead(char(")"))))) {
          if (depth > 0) {
            results.push(run(parenToken(")")));
            depth--;
            run(optionalWhitespace);
            continue;
          }
          run(char(")"));
          return results;
        }

        results.push(run(argumentExpressionParser([char(")"), char("(")])));
        run(optionalWhitespace);
      }
    }),
  );
