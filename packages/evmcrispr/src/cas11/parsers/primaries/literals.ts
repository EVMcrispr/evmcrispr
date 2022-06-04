import { between, char, choice, regex, str } from 'arcsecond';

import type {
  AddressLiteralNode,
  BooleanLiteralNode,
  BytesLiteralNode,
  NumericLiteralNode,
  StringLiteralNode,
} from '../../types';
import { NodeType } from '../../types';

export const addressParser = regex(/^0x[a-fA-F0-9]{40}(?=\s|:|,|$)/).map(
  (value): AddressLiteralNode => ({
    type: NodeType.AddressLiteral,
    value,
  }),
);
export const hexadecimalParser = regex(/^0x[0-9a-f]+/).map(
  (value): BytesLiteralNode => ({
    type: NodeType.BytesLiteral,
    value,
  }),
);

export const booleanParser = choice([str('true'), str('false')]).map(
  (value): BooleanLiteralNode => ({
    type: NodeType.BoolLiteral,
    value: value === 'true',
  }),
);

const numberRegex =
  /^(?<value>\d+(?:\.\d*)?)(?:e(?<power>\d+))?(?<timeUnit>mo|s|m|h|d|w|y)?/;

export const numberParser = regex(numberRegex).map(
  (rawValue): NumericLiteralNode => {
    const res = numberRegex.exec(rawValue);
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    const { value, power, timeUnit } = res?.groups!;
    const numericNode: NumericLiteralNode = {
      type: NodeType.NumberLiteral,
      value: Number(value),
    };

    if (power) numericNode.power = parseInt(power);
    if (timeUnit) numericNode.timeUnit = timeUnit;

    return numericNode;
  },
);

export const stringParser = choice([
  between(char('"'))(char('"'))(regex(/^[^"]*/)),
  between(char("'"))(char("'"))(regex(/^[^']*/)),
]).map(
  (value): StringLiteralNode => ({
    type: NodeType.StringLiteral,
    value: value as string,
  }),
);
