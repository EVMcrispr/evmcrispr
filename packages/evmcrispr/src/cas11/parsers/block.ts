import type { Parser } from 'arcsecond';
import { char, coroutine, recursiveParser } from 'arcsecond';

import type { BlockExpressionNode } from '../types';
import { NodeType } from '../types';
import { commandExpressionParser } from './command';
import {
  endOfLine,
  optionalEmptyLines,
  optionalWhitespace,
  surroundedBy,
} from './utils';

export const blockExpressionParser: Parser<BlockExpressionNode, string, any> =
  recursiveParser(() =>
    coroutine(function* () {
      yield char('(');

      yield optionalWhitespace;

      yield endOfLine;

      const scopedCommands = yield optionalEmptyLines(commandExpressionParser);

      yield surroundedBy(optionalWhitespace)(char(')'));

      return {
        type: NodeType.BlockExpression,
        body: scopedCommands,
      } as unknown as BlockExpressionNode;
    }),
  );
