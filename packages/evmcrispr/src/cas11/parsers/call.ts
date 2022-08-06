import {
  choice,
  coroutine,
  letters,
  possibly,
  recursiveParser,
} from 'arcsecond';

import type { CallExpressionNode, NodeParser } from '../types';
import { NodeType } from '../types';

import {
  addressParser,
  probableIdentifierParser,
  variableIdentifierParser,
} from './primaries';
import { argumentsParser } from './expression';
import { helperFunctionParser } from './helper';
import { callOperatorParser } from './utils';

export const callExpressionParser: NodeParser<CallExpressionNode> =
  recursiveParser(() =>
    coroutine(function* () {
      const target = yield choice([
        addressParser,
        variableIdentifierParser,
        helperFunctionParser,
        probableIdentifierParser,
      ]);

      let callSymbol: string | null =
        (yield callOperatorParser) as unknown as string;
      let callExpressionNode: any = target;

      do {
        const method = yield letters;

        const args = yield argumentsParser;

        callExpressionNode = {
          type: NodeType.CallExpression,
          target: callExpressionNode,
          method,
          args,
        };

        // Check for chained call expressions
        callSymbol = (yield possibly(callOperatorParser)) as unknown as
          | string
          | null;
      } while (callSymbol);

      return callExpressionNode;
    }),
  );
