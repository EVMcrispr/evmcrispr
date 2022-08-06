import { char, coroutine, recursiveParser, sequenceOf } from 'arcsecond';

import type {
  BlockExpressionNode,
  CommandExpressionNode,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { commandExpressionParser } from './command';
import { endOfLine, optionalEmptyLines, optionalWhitespace } from './utils';

export const blockExpressionParser: NodeParser<BlockExpressionNode> =
  recursiveParser(() =>
    coroutine(function* () {
      yield char('(');

      yield optionalWhitespace;

      yield endOfLine;

      const scopedCommands = (yield optionalEmptyLines<CommandExpressionNode>(
        commandExpressionParser,
      )) as unknown as CommandExpressionNode[];

      yield sequenceOf([optionalWhitespace, char(')')]);

      const n: BlockExpressionNode = {
        type: NodeType.BlockExpression,
        body: scopedCommands,
      };

      return n;
    }),
  );
