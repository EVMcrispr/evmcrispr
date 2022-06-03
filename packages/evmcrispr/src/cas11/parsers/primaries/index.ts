import { choice, recursiveParser } from 'arcsecond';

import { identifierParser, variableIdentifierParser } from './identifiers';
import {
  addressParser,
  booleanParser,
  hexadecimalParser,
  numberParser,
  stringParser,
} from './literals';

export const primaryParser = recursiveParser(() =>
  choice([
    addressParser,
    hexadecimalParser,
    booleanParser,
    numberParser,
    stringParser,
    variableIdentifierParser,
    identifierParser,
  ]),
);

export * from './identifiers';

export * from './literals';
