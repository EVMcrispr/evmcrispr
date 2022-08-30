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
import { arithmeticParser } from './arithmetic';
import { arrayExpressionParser } from './array';
import { blockExpressionParser } from './block';

import { callExpressionParser } from './call';
import { helperFunctionParser } from './helper';
import {
  primaryParser,
  probableIdentifierParser,
  stringParser,
} from './primaries';
import {
  commaSeparated,
  createNodeLocation,
  locate,
  whitespace,
} from './utils';

const asExpressionParser: NodeParser<AsExpressionNode> =
  locate<AsExpressionNode>(
    sequenceOf([
      choice([stringParser, probableIdentifierParser]),
      whitespace,
      str('as'),
      whitespace,
      choice([stringParser, probableIdentifierParser]),
    ]),
    ({ data, index, result: [initialContext, [left, , , , right]] }) => ({
      type: NodeType.AsExpression,
      left: left as AsExpressionNode['left'],
      right: right as AsExpressionNode['right'],
      loc: createNodeLocation(initialContext, {
        line: data.line,
        index,
        offset: data.offset,
      }),
    }),
  );
export const argumentExpressionParser: NodeParser<ArgumentExpressionNode> =
  recursiveParser(() =>
    choice([
      arithmeticParser,
      callExpressionParser,
      helperFunctionParser,
      arrayExpressionParser,
      primaryParser,
    ]).errorMap(({ error, index }) => {
      return `ExpressionParserError(col: ${index}): Expecting a valid expression${getIncorrectReceivedValue(
        error,
      )}`;
    }),
  );

export const expressionParser: NodeParser<
  CommandArgExpressionNode | string | null
> = recursiveParser(() =>
  choice([
    arithmeticParser,
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
