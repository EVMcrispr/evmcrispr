import type { Parser } from 'arcsecond';
import { between, char, choice, coroutine, recursiveParser } from 'arcsecond';

import { NodeType } from '../types';

import { addressParser, identifierParser, primaryParser } from './primaries';
import { commaSeparated } from './utils';
import { helperFunctionParser } from './helper';

export const callExpressionParser = recursiveParser(() =>
  coroutine(function* () {
    const target = yield choice([addressParser, identifierParser]);

    yield char(':');

    const callee = yield identifierParser;

    const args = yield argumentsParser;

    return {
      type: NodeType.CallExpression,
      target,
      callee,
      args: args,
    };
  }),
);

export const argumentsParser: Parser<unknown, string, any> = recursiveParser(
  () =>
    between(char('('))(char(')'))(
      commaSeparated(
        choice([helperFunctionParser, callExpressionParser, primaryParser]),
      ),
    ),
);
