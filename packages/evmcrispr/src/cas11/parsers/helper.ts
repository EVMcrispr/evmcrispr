import { char, coroutine, letters, possibly, recursiveParser } from 'arcsecond';

import type { StringLiteralNode } from '../types';
import { NodeType } from '../types';
import { argumentsParser } from './expression';

export const helperFunctionParser = recursiveParser(() =>
  coroutine(function* () {
    yield char('@');

    const name = yield letters.map(
      (value): StringLiteralNode => ({
        type: NodeType.StringLiteral,
        value,
      }),
    );

    const args = yield possibly(argumentsParser);

    return {
      type: NodeType.HelperFunctionExpression,
      name,
      args: args === null ? [] : args,
    };
  }),
);
