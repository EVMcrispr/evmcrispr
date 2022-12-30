import { coroutine, getData, recursiveParser, sequenceOf } from 'arcsecond';

import type {
  BlockExpressionNode,
  CommandExpressionNode,
  NodeParser,
  NodeParserState,
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
        const [initialState, initialIndex] = (yield getData.mapFromData(
          ({ data, index }) => [data, index],
        )) as unknown as [NodeParserState, number];
        yield sequenceOf([openingCharParser('('), endLine]);

        const scopedCommands = (yield linesParser(
          commandExpressionParser,
          closingCharParser(')'),
          {
            endingChar: ')',
            parserErrorType: BLOCK_PARSER_ERROR,
            initialState,
            initialIndex,
          },
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
