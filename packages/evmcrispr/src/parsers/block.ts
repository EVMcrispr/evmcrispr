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
      coroutine(run => {
        const [initialState, initialIndex]: [NodeParserState, number] = run(getData.mapFromData(
          ({ data, index }) => [data, index],
        ));
        run(sequenceOf([openingCharParser('('), endLine]));

        const scopedCommands: CommandExpressionNode[] = run(linesParser(
          commandExpressionParser,
          closingCharParser(')'),
          {
            endingChar: ')',
            parserErrorType: BLOCK_PARSER_ERROR,
            initialState,
            initialIndex,
          },
        ));

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
