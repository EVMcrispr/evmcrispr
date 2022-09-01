import { between, char, recursiveParser } from 'arcsecond';

import type { ArrayExpressionNode, NodeParser } from '../types';
import { NodeType } from '../types';
import { buildParserError } from '../utils/parsers';
import { argumentExpressionParser } from './expression';

import {
  closingCharParser,
  comma,
  commaSeparated,
  createNodeLocation,
  locate,
  openingCharParser,
} from './utils';

export const ARRAY_PARSER_ERROR = 'ArrayParserError';

export const arrayExpressionParser: NodeParser<ArrayExpressionNode> =
  recursiveParser(() =>
    locate<ArrayExpressionNode>(
      between(openingCharParser('['))(closingCharParser(']'))(
        commaSeparated(argumentExpressionParser([comma, char(']')])),
      )
        .map((elements) => [elements])
        .errorMap((err) => buildParserError(err, ARRAY_PARSER_ERROR)),
      ({
        data: { line, offset },
        index,
        result: [initialContext, [elements]],
      }) => ({
        type: NodeType.ArrayExpression,
        elements: elements as ArrayExpressionNode['elements'],
        loc: createNodeLocation(initialContext, { index, line, offset }),
      }),
    ),
  );
