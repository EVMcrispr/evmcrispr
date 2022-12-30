import { choice, recursiveParser } from 'arcsecond';

import type { EnclosingNodeParser, PrimaryExpressionNode } from '../../types';

import {
  addressParser,
  booleanParser,
  hexadecimalParser,
  numberParser,
  stringParser,
} from './literals';

export const primaryParser: EnclosingNodeParser<PrimaryExpressionNode> = (
  enclosingParsers = [],
) =>
  recursiveParser(() =>
    choice([
      addressParser(enclosingParsers),
      hexadecimalParser(enclosingParsers),
      booleanParser(enclosingParsers),
      numberParser(enclosingParsers),
      stringParser(enclosingParsers),
    ]),
  );

export * from './identifiers';

export * from './literals';
