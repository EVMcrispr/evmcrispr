import type { Parser } from 'arcsecond';
import {
  between,
  char,
  coroutine,
  recursiveParser,
  sequenceOf,
} from 'arcsecond';

import type { ArrayExpressionNode } from '../types';
import { NodeType } from '../types';

import { argumentExpressionParser } from './expression';

import { commaSeparated, optionalWhitespace } from './utils';

export const arrayExpressionParser: Parser<any, string, any> = recursiveParser(
  () =>
    between(sequenceOf([char('['), optionalWhitespace]))(
      sequenceOf([optionalWhitespace, char(']')]),
    )(commaSeparated(argumentExpressionParser)).map(
      (elements: any): ArrayExpressionNode => {
        return {
          type: NodeType.ArrayExpression,
          elements,
        };
      },
    ),
);

export const arrayExpresionParser = recursiveParser(() =>
  coroutine(function* () {
    yield char('[');
    yield optionalWhitespace;
    const elements = yield commaSeparated(argumentExpressionParser);
    yield optionalWhitespace;
    yield char(']');

    return {
      type: NodeType.ArrayExpression,
      elements,
    };
  }),
);
