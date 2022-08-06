import { char, coroutine, possibly, recursiveParser, regex } from 'arcsecond';

import type {
  ArgumentExpressionNode,
  HelperFunctionNode,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { argumentsParser } from './expression';

const helperNameParser = regex(/^(?!-|\.)[a-zA-Z\-.]+(?<!-|\.)/);

export const helperFunctionParser: NodeParser<HelperFunctionNode> =
  recursiveParser(() =>
    coroutine(function* () {
      yield char('@');

      const name = (yield helperNameParser) as unknown as string;

      const args = (yield possibly(argumentsParser)) as unknown as
        | null
        | ArgumentExpressionNode[];

      const n: HelperFunctionNode = {
        type: NodeType.HelperFunctionExpression,
        name,
        args: args === null ? [] : args,
      };

      return n;
    }),
  );
