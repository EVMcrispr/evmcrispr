import type { Parser } from 'arcsecond';
import { between, char, choice, recursiveParser } from 'arcsecond';

import type { ArrayExpressionNode } from '../types';
import { NodeType } from '../types';

import { expressionParser } from './expression';

import { commaSeparated } from './utils';

export const arrayExpressionParser: Parser<any, string, any> = recursiveParser(
  () =>
    between(char('['))(char(']'))(
      commaSeparated(choice([arrayExpressionParser, expressionParser])),
    ).map((elements: any): ArrayExpressionNode => {
      return {
        type: NodeType.ArrayExpression,
        elements,
      };
    }),
);
