import { regex, sequenceOf } from 'arcsecond';

import { NodeType } from '../../../types';
import type { AddressLiteralNode, EnclosingNodeParser } from '../../../types';
import { buildParserError } from '../../../utils/parsers';
import {
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
} from '../../utils';

export const ADDRESS_PARSER_ERROR = 'AddressParserError';

export const addressParser: EnclosingNodeParser<AddressLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<AddressLiteralNode>(
    sequenceOf([
      regex(/^0x[a-fA-F0-9]{40}/),
      enclosingLookaheadParser(enclosingParsers),
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
