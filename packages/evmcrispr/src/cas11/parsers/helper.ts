import { char, coroutine, possibly, recursiveParser } from 'arcsecond';

import { argumentsParser } from './call';
import { NodeType } from '../types';

import { identifierParser } from './primaries';

export const helperFunctionParser = recursiveParser(() =>
  coroutine(function* () {
    yield char('@');

    const name = yield identifierParser;

    const args = yield possibly(argumentsParser);

    return {
      type: NodeType.HelperFunctionExpression,
      name,
      args: args === null ? [] : args,
    };
  }),
);
