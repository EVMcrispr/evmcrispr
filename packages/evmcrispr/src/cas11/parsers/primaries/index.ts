import { choice, recursiveParser } from 'arcsecond';

import type { NodeParser, PrimaryExpressionNode } from '../../types';

import {
  probableIdentifierParser,
  variableIdentifierParser,
} from './identifiers';
import {
  addressParser,
  booleanParser,
  hexadecimalParser,
  numberParser,
  stringParser,
} from './literals';

export const primaryParser: NodeParser<PrimaryExpressionNode> = recursiveParser(
  () =>
    choice([
      addressParser,
      hexadecimalParser,
      booleanParser,
      numberParser,
      stringParser,
      variableIdentifierParser,
      probableIdentifierParser,
    ]),
);

export * from './identifiers';

export * from './literals';
