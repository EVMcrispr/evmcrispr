import { char, coroutine, possibly, recursiveParser, regex } from 'arcsecond';

import type { StringLiteralNode } from '../types';
import { NodeType } from '../types';
import { argumentsParser } from './expression';

const helperNameParser = regex(/^(?!-|\.)[a-zA-Z\-.]+(?<!-|\.)/).map(
  (value): StringLiteralNode => ({
    type: NodeType.StringLiteral,
    value,
  }),
);

export const helperFunctionParser = recursiveParser(() =>
  coroutine(function* () {
    yield char('@');

    const name = yield helperNameParser;

    const args = yield possibly(argumentsParser);

    return {
      type: NodeType.HelperFunctionExpression,
      name,
      args: args === null ? [] : args,
    };
  }),
);
