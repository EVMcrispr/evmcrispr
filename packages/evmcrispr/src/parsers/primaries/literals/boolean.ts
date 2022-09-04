import { choice, sequenceOf, str } from 'arcsecond';

import type { BooleanLiteralNode, EnclosingNodeParser } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import {
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
} from '../../utils';

export const BOOLEAN_PARSER_ERROR = 'BooleanParserError';

export const booleanParser: EnclosingNodeParser<BooleanLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<BooleanLiteralNode>(
    sequenceOf([
      choice([str('true'), str('false')]),
      enclosingLookaheadParser(enclosingParsers),
    ]).errorMap((err) =>
      buildParserError(
        err,
        BOOLEAN_PARSER_ERROR,
        'Expecting "true" or "false"',
      ),
    ),
    ({ data, index, result: [initialContext, [value]] }) => ({
      type: NodeType.BoolLiteral,
      value: value === 'true',
      loc: createNodeLocation(initialContext, {
        line: data.line,
        index,
        offset: data.offset,
      }),
    }),
  );
