import type { Parser } from 'arcsecond';
import {
  char,
  choice,
  coroutine,
  letters,
  possibly,
  recursiveParser,
} from 'arcsecond';

import type { StringLiteralNode } from '../types';
import { NodeType } from '../types';

import {
  addressParser,
  probableIdentifierParser,
  variableIdentifierParser,
} from './primaries';
import { argumentsParser } from './expression';
import { helperFunctionParser } from './helper';

export const callExpressionParser: Parser<any, string, any> = recursiveParser(
  () =>
    coroutine(function* () {
      const target = yield choice([
        addressParser,
        variableIdentifierParser,
        helperFunctionParser,
        probableIdentifierParser,
      ]);

      let res = yield char(':');
      let callExpressionNode: any = target;

      do {
        const callee = yield letters.map(
          (value): StringLiteralNode => ({
            type: NodeType.StringLiteral,
            value,
          }),
        );

        const args = yield argumentsParser;

        callExpressionNode = {
          type: NodeType.CallExpression,
          target: callExpressionNode,
          callee,
          args,
        };

        res = yield possibly(char(':'));
      } while (res);

      return callExpressionNode;
    }),
);
