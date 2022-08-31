import {
  char,
  choice,
  endOfInput,
  everythingUntil,
  sequenceOf,
} from 'arcsecond';

import { endOfLine, optionalWhitespace } from './utils';

const commentInitializerChar = char('#');

export const commentParser = sequenceOf([
  optionalWhitespace,
  commentInitializerChar,
  everythingUntil(choice([endOfInput, endOfLine])),
]);
