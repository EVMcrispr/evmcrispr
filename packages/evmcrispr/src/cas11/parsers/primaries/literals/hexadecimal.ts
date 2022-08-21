import { regex, sequenceOf } from 'arcsecond';

import type { BytesLiteralNode, NodeParser } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import { enclosingLookaheadParser } from '../../utils';

export const HEXADECIMAL_PARSER_ERROR = 'HexadecimalParserError';

export const hexadecimalParser: NodeParser<BytesLiteralNode> = sequenceOf([
  regex(/^0x[0-9a-f]+/),
  enclosingLookaheadParser,
])
  .errorMap((err) =>
    buildParserError(
      err,
      HEXADECIMAL_PARSER_ERROR,
      'Expecting a hexadecimal value',
    ),
  )
  .map(([value]) => ({
    type: NodeType.BytesLiteral,
    value,
  }));
