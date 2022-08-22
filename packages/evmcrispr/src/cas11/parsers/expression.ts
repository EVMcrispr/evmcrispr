import {
  between,
  char,
  choice,
  optionalWhitespace,
  recursiveParser,
  sequenceOf,
  str,
} from 'arcsecond';

import type {
  ArgumentExpressionNode,
  AsExpressionNode,
  CommandArgExpressionNode,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { getIncorrectReceivedValue } from '../utils/parsers';
import { arrayExpressionParser } from './array';
import { blockExpressionParser } from './block';

import { callExpressionParser } from './call';
import { helperFunctionParser } from './helper';
import {
  primaryParser,
  probableIdentifierParser,
  stringParser,
} from './primaries';
import { commaSeparated, whitespace } from './utils';

const asExpressionParser: NodeParser<AsExpressionNode> = sequenceOf([
  choice([stringParser, probableIdentifierParser]),
  whitespace,
  str('as'),
  whitespace,
  choice([stringParser, probableIdentifierParser]),
]).map(([left, , , , right]) => ({
  type: NodeType.AsExpression,
  left,
  right,
}));

export const argumentExpressionParser: NodeParser<ArgumentExpressionNode> =
  recursiveParser(() =>
    choice([
      callExpressionParser,
      helperFunctionParser,
      arrayExpressionParser,
      primaryParser,
    ]).errorMap(({ error, index }) => {
      return `ExpressionParserError(col: ${index}): No expression found${getIncorrectReceivedValue(
        error,
      )}`;
    }),
  );

export const expressionParser: NodeParser<CommandArgExpressionNode> =
  recursiveParser(() =>
    choice([
      asExpressionParser,
      callExpressionParser,
      helperFunctionParser,
      blockExpressionParser,
      arrayExpressionParser,
      primaryParser,
    ]),
  );

export const argumentsParser: NodeParser<ArgumentExpressionNode[]> =
  recursiveParser(() =>
    between<
      [string, string | null],
      ArgumentExpressionNode[],
      [string | null, string]
    >(sequenceOf([char('('), optionalWhitespace]))(
      sequenceOf([optionalWhitespace, char(')')]),
    )(commaSeparated<ArgumentExpressionNode>(argumentExpressionParser)),
  );
