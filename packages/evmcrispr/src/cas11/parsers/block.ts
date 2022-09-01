import { coroutine, recursiveParser, sequenceOf } from 'arcsecond';

import type {
  BlockExpressionNode,
  CommandExpressionNode,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { buildParserError } from '../utils/parsers';
import { commandExpressionParser } from './command';
import {
  closingCharParser,
  createNodeLocation,
  endLine,
  linesParser,
  locate,
  openingCharParser,
} from './utils';

const BLOCK_PARSER_ERROR = 'BlockParserError';

export const blockExpressionParser: NodeParser<BlockExpressionNode> =
  recursiveParser(() =>
    locate<BlockExpressionNode>(
      coroutine(function* () {
        yield sequenceOf([openingCharParser('('), endLine]);

        const scopedCommands = (yield linesParser(
          commandExpressionParser,
          closingCharParser(')'),
        )) as unknown as CommandExpressionNode[];

        return [scopedCommands];
      }).errorMap((err) => buildParserError(err, BLOCK_PARSER_ERROR)),
      ({
        data: { line, offset },
        index,
        result: [initialContext, [scopedCommands]],
      }) => ({
        type: NodeType.BlockExpression,
        body: scopedCommands as BlockExpressionNode['body'],
        loc: createNodeLocation(initialContext, { index, line, offset }),
      }),
    ),
  );
