import type {
  ArgumentExpressionNode,
  CommandArgExpressionNode,
  EnclosingNodeParser,
  NodeParser,
} from "@evmcrispr/sdk";
import { getIncorrectReceivedValue } from "@evmcrispr/sdk";
import { between, char, choice, recursiveParser } from "arcsecond";
import { arithmeticParser } from "./arithmetic";
import { arrayExpressionParser } from "./array";
import { blockExpressionParser } from "./block";

import { callExpressionParser } from "./call";
import { helperFunctionParser } from "./helper";
import {
  barewordParser,
  primaryParser,
  variableIdentifierParser,
} from "./primaries";
import {
  closingCharParser,
  comma,
  commaSeparated,
  openingCharParser,
} from "./utils";

export const argumentExpressionParser: EnclosingNodeParser<
  ArgumentExpressionNode
> = (enclosingParsers = []) =>
  recursiveParser(() =>
    choice([
      arithmeticParser,
      callExpressionParser,
      helperFunctionParser,
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
      arithmeticParser,
      callExpressionParser,
      helperFunctionParser,
      blockExpressionParser,
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

export const argumentsParser: NodeParser<ArgumentExpressionNode[]> =
  recursiveParser(() =>
    between<
      [string, string | null],
      ArgumentExpressionNode[],
      [string | null, string]
    >(openingCharParser("("))(closingCharParser(")"))(
      commaSeparated<ArgumentExpressionNode>(
        argumentExpressionParser([comma, char(")")]),
      ),
    ),
  );
