import { between, char, choice, regex, str } from 'arcsecond';

import type { LiteralExpressionNode } from '../../types';
import { NodeType } from '../../types';

export const addressParser = regex(/^0x[a-fA-F0-9]{40}(?=\s|:|,|$)/).map(
  (value): LiteralExpressionNode => ({
    type: NodeType.AddressLiteral,
    value,
  }),
);
export const hexadecimalParser = regex(/^0x[0-9a-f]+/).map(
  (value): LiteralExpressionNode => ({
    type: NodeType.BytesLiteral,
    value,
  }),
);

export const booleanParser = choice([str('true'), str('false')]).map(
  (value): LiteralExpressionNode => ({
    type: NodeType.BoolLiteral,
    value,
  }),
);

export const numberParser = regex(
  /^(\d+(?:\.\d*)?)(?:e(\d+))?(mo|s|m|h|d|w|y)?/,
).map(
  (value): LiteralExpressionNode => ({
    type: NodeType.NumberLiteral,
    value,
  }),
);

export const stringParser = choice([
  between(char('"'))(char('"'))(regex(/^[^"]*/)),
  between(char("'"))(char("'"))(regex(/^[^']*/)),
]).map(
  (value): LiteralExpressionNode => ({
    type: NodeType.StringLiteral,
    value,
  }),
);
