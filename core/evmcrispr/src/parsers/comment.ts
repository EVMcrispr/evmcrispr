import {
  char,
  choice,
  endOfInput,
  everythingUntil,
  recursiveParser,
  sequenceOf,
} from 'arcsecond';

import { endLine, optionalWhitespace } from './utils';

const commentInitializerChar = char('#');

export const commentParser = recursiveParser(() =>
  sequenceOf([
    optionalWhitespace,
    commentInitializerChar,
    everythingUntil(choice([endOfInput, endLine])),
  ]),
);
