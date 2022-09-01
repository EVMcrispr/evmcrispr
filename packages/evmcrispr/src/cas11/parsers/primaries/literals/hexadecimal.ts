import { regex, sequenceOf } from 'arcsecond';

import type { BytesLiteralNode, EnclosingNodeParser } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import {
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
} from '../../utils';

export const HEXADECIMAL_PARSER_ERROR = 'HexadecimalParserError';

export const hexadecimalParser: EnclosingNodeParser<BytesLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<BytesLiteralNode>(
    sequenceOf([
      regex(/^0x[0-9a-f]+/),
      enclosingLookaheadParser(enclosingParsers),
    ]).errorMap((err) =>
      buildParserError(
        err,
        HEXADECIMAL_PARSER_ERROR,
        'Expecting a hexadecimal value',
      ),
    ),
    ({ data, index, result: [initialContext, [value]] }) => ({
      type: NodeType.BytesLiteral,
      value: value as BytesLiteralNode['value'],
      loc: createNodeLocation(initialContext, {
        line: data.line,
        index,
        offset: data.offset,
      }),
    }),
  );
