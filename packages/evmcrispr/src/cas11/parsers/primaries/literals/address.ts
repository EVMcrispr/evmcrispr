import { choice, lookAhead, regex, sequenceOf } from 'arcsecond';

import type { AddressLiteralNode, NodeParser } from '../../../types';
import { NodeType } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import {
  baseEnclosingCharParsers,
  callOperatorParser,
  createNodeLocation,
  locate,
} from '../../utils';

export const ADDRESS_PARSER_ERROR = 'AddressParserError';

export const addressParser: NodeParser<AddressLiteralNode> =
  locate<AddressLiteralNode>(
    sequenceOf([
      regex(/^0x[a-fA-F0-9]{40}/),
      lookAhead(choice([...baseEnclosingCharParsers, callOperatorParser])),
    ]).errorMap((err) =>
      buildParserError(err, ADDRESS_PARSER_ERROR, 'Expecting an address'),
    ),
    ({ data, index, result: [initialContext, [value]] }) => ({
      type: NodeType.AddressLiteral,
      value: value as AddressLiteralNode['value'],
      loc: createNodeLocation(initialContext, {
        line: data.line,
        index,
        offset: data.offset,
      }),
    }),
  );
