import { choice, recursiveParser, sequenceOf, str } from 'arcsecond';

import type { AsExpressionNode } from '../types';
import { NodeType } from '../types';
import { blockExpressionParser } from './block';

import { callExpressionParser } from './call';
import { helperFunctionParser } from './helper';
import { identifierParser, primaryParser } from './primaries';
import { whitespace } from './utils';

const asExpressionParser = sequenceOf([
  identifierParser,
  whitespace,
  str('as'),
  whitespace,
  identifierParser,
]).map(
  ([left, , , , right]): AsExpressionNode => ({
    type: NodeType.AsExpression,
    left,
    right,
  }),
);

export const expressionParser = recursiveParser(() =>
  choice([
    asExpressionParser,
    helperFunctionParser,
    callExpressionParser,
    primaryParser,
    blockExpressionParser,
  ]),
);
