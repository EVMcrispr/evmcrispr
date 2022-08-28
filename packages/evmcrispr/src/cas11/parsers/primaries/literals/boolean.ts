import { choice, sequenceOf, str } from 'arcsecond';

import type { BooleanLiteralNode, NodeParser } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import {
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
} from '../../utils';

export const BOOLEAN_PARSER_ERROR = 'BooleanParserError';

export const booleanParser: NodeParser<BooleanLiteralNode> =
  locate<BooleanLiteralNode>(
    sequenceOf([
      choice([str('true'), str('false')]),
      enclosingLookaheadParser,
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
