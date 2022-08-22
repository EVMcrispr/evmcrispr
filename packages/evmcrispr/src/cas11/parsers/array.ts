import { between, char, recursiveParser, sequenceOf } from 'arcsecond';

import type { ArrayExpressionNode, NodeParser } from '../types';
import { NodeType } from '../types';
import { buildParserError } from '../utils/parsers';

import { argumentExpressionParser } from './expression';

import { commaSeparated, optionalWhitespace } from './utils';

export const ARRAY_PARSER_ERROR = 'ArrayParserError';

export const arrayExpressionParser: NodeParser<ArrayExpressionNode> =
  recursiveParser(() =>
    between(sequenceOf([char('['), optionalWhitespace]))(
      sequenceOf([optionalWhitespace, char(']')]),
    )(commaSeparated(argumentExpressionParser))
      .errorMap((err) => buildParserError(err, ARRAY_PARSER_ERROR))
      .map((elements: any) => {
        return {
          type: NodeType.ArrayExpression,
          elements,
        };
      }),
  );
