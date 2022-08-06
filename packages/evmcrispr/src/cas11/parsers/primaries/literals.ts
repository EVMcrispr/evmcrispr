import {
  between,
  char,
  choice,
  lookAhead,
  regex,
  sequenceOf,
  str,
} from 'arcsecond';

import type {
  AddressLiteralNode,
  BooleanLiteralNode,
  BytesLiteralNode,
  NodeParser,
  NumericLiteralNode,
  StringLiteralNode,
} from '../../types';
import { NodeType } from '../../types';
import {
  callOperatorParser,
  commonEnclosingCharParsers,
  enclosingLookaheadParser,
} from '../utils';

export const addressParser: NodeParser<AddressLiteralNode> = sequenceOf([
  regex(/^0x[a-fA-F0-9]{40}/),
  lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
]).map(([value]) => ({
  type: NodeType.AddressLiteral,
  value,
}));

export const hexadecimalParser: NodeParser<BytesLiteralNode> = sequenceOf([
  regex(/^0x[0-9a-f]+/),
  enclosingLookaheadParser,
]).map(
  ([value]): BytesLiteralNode => ({
    type: NodeType.BytesLiteral,
    value,
  }),
);

export const booleanParser: NodeParser<BooleanLiteralNode> = sequenceOf([
  choice([str('true'), str('false')]),
  enclosingLookaheadParser,
]).map(([value]) => ({
  type: NodeType.BoolLiteral,
  value: value === 'true',
}));

const numberRegex =
  /^(?<value>\d+(?:\.\d*)?)(?:e(?<power>\d+))?(?<timeUnit>mo|s|m|h|d|w|y)?/;

export const numberParser: NodeParser<NumericLiteralNode> = sequenceOf([
  regex(numberRegex),
  enclosingLookaheadParser,
]).map(([rawValue]) => {
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
});

export const stringParser: NodeParser<StringLiteralNode> = choice([
  between(char('"'))(char('"'))(regex(/^[^"]*/)),
  between(char("'"))(char("'"))(regex(/^[^']*/)),
]).map((value) => ({
  type: NodeType.StringLiteral,
  value: value as string,
}));
