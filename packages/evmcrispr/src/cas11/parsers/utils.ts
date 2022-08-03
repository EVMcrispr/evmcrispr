import type { Parser } from 'arcsecond';
import {
  between,
  char,
  choice,
  coroutine,
  endOfInput,
  lookAhead,
  many,
  possibly,
  recursiveParser,
  regex,
  sepBy,
  sequenceOf,
  str,
} from 'arcsecond';

import type { Node } from '../types';

export const callOperatorParser = str('::');

export const endOfLine = char('\n');

// Overwrite arcsecond's parser as it ignores newline character
export const whitespace = regex(/^ +/);

export const optionalWhitespace = possibly(whitespace);

export const emptyLine = sequenceOf([possibly(whitespace), endOfLine]).map(
  () => null,
);

export const commonEnclosingCharParsers = [
  char(','),
  char(' '),
  char(']'),
  char(')'),
  endOfLine,
  endOfInput,
];

export const enclosingLookaheadParser = lookAhead(
  choice(commonEnclosingCharParsers),
);

export const surroundedBy = (
  parser: Parser<any, any, any>,
): ((p: Parser<unknown, string, any>) => Parser<unknown, any, any>) =>
  between(parser)(parser);

export const commaSeparated = sepBy<any, Node, string, any>(
  surroundedBy(optionalWhitespace)(char(',')),
);

export const optionalEmptyLines = (
  p: Parser<any, string, any>,
): Parser<any, string, any> =>
  recursiveParser(() =>
    coroutine(function* () {
      const lines = (yield many(choice([emptyLine, p]))) ?? [];

      return lines.filter((l: any) => !!l);
    }),
  );
