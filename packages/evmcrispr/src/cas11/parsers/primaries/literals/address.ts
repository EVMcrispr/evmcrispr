import { choice, lookAhead, regex, sequenceOf } from 'arcsecond';

import type { AddressLiteralNode, NodeParser } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import { callOperatorParser, commonEnclosingCharParsers } from '../../utils';

export const ADDRESS_PARSER_ERROR = 'AddressParserError';

export const addressParser: NodeParser<AddressLiteralNode> = sequenceOf([
  regex(/^0x[a-fA-F0-9]{40}/),
  lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
])
  .map(
    ([value]): AddressLiteralNode => ({
      type: NodeType.AddressLiteral,
      value,
    }),
  )
  .errorMap((err) =>
    buildParserError(err, ADDRESS_PARSER_ERROR, 'Expecting an address'),
  );
