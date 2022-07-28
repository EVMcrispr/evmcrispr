import type { Parser } from 'arcsecond';
import {
  between,
  char,
  choice,
  optionalWhitespace,
  recursiveParser,
  sequenceOf,
  str,
} from 'arcsecond';

import type { AsExpressionNode } from '../types';
import { NodeType } from '../types';
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

const asExpressionParser = sequenceOf([
  choice([stringParser, probableIdentifierParser]),
  whitespace,
  str('as'),
  whitespace,
  choice([stringParser, probableIdentifierParser]),
]).map(
  ([left, , , , right]): AsExpressionNode => ({
    type: NodeType.AsExpression,
    left,
    right,
  }),
);

export const argumentExpressionParser: Parser<any, string, any> =
  recursiveParser(() =>
    choice([
      callExpressionParser,
      helperFunctionParser,
      primaryParser,
      arrayExpressionParser,
    ]),
  );

export const expressionParser = recursiveParser(() =>
  choice([
    asExpressionParser,
    callExpressionParser,
    helperFunctionParser,
    blockExpressionParser,
    arrayExpressionParser,
    primaryParser,
  ]),
);

export const argumentsParser: Parser<unknown, string, any> = recursiveParser(
  () =>
    between(sequenceOf([char('('), optionalWhitespace]))(
      sequenceOf([optionalWhitespace, char(')')]),
    )(commaSeparated(argumentExpressionParser)),
);
