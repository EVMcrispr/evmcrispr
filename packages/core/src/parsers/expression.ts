import type {
  ArgumentExpressionNode,
  BarewordNode,
  CommandArgExpressionNode,
  EnclosingNodeParser,
  NodeParser,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
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
import { namedArgParser } from "./namedArg";
import {
  barewordParser,
  primaryParser,
  variableIdentifierParser,
} from "./primaries";
import {
  createNodeLocation,
  locate,
  optionalMultilineWhitespace,
} from "./utils";

export const EXPRESSION_PARSER_ERROR_MSG =
  'Expected a value: a literal (1e18, 0x…, "text", true), $variable, ' +
  "@helper(...), [array] or (block)";

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
    ]).errorMap((err) =>
      buildParserError(
        err,
        "ExpressionParserError",
        EXPRESSION_PARSER_ERROR_MSG,
      ),
    ),
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
    ]).errorMap((err) =>
      buildParserError(
        err,
        "ExpressionParserError",
        EXPRESSION_PARSER_ERROR_MSG,
      ),
    ),
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
      run(char("("));
      run(optionalMultilineWhitespace);

      const results: ArgumentExpressionNode[] = [];
      let depth = 0;

      if (run(possibly(char(")")))) return results;

      while (true) {
        const lp = run(possibly(parenToken("(")));
        if (lp) {
          results.push(lp);
          depth++;
          run(optionalMultilineWhitespace);
          continue;
        }

        if (run(possibly(lookAhead(char(")"))))) {
          if (depth > 0) {
            results.push(run(parenToken(")")));
            depth--;
            run(optionalMultilineWhitespace);
            continue;
          }
          run(char(")"));
          return results;
        }

        // `name:value` named args are only meaningful in helper parens (and
        // array literals) — try them before the regular expression parsers
        // so `opt:3` doesn't get swallowed as a bareword.
        const named = run(possibly(namedArgParser([char(")"), char("(")])));
        if (named) {
          results.push(named);
        } else {
          results.push(run(argumentExpressionParser([char(")"), char("(")])));
        }
        run(optionalMultilineWhitespace);
      }
    }),
  );
