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

import type { Node, NodeParser } from '../types';

export const callOperatorParser = str('::');

export const endOfLine = char('\n');

// Overwrite arcsecond's parser as it ignores newline character
export const whitespace = regex(/^ +/);

export const optionalWhitespace = possibly(whitespace);

export const emptyLine = sequenceOf([possibly(whitespace), endOfLine]).map(
  () => null,
);

export const camelAndKebabCase = regex(/^(?!-)[a-zA-Z\d-]+(?<!-)/);

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
  parser: Parser<any, string, any>,
): ((p: Parser<any, string, any>) => Parser<any, string, any>) =>
  between(parser)(parser);

export const commaSeparated: <T = Node>(
  parser: NodeParser<T>,
) => NodeParser<T[]> = sepBy(surroundedBy(optionalWhitespace)(char(',')));

export const optionalEmptyLines = <T = Node>(
  p: NodeParser<T>,
): NodeParser<T[]> =>
  recursiveParser(() =>
    coroutine(function* () {
      const lines = ((yield many(choice([emptyLine, p]))) ??
        []) as unknown as (null | T)[];

      return lines.filter((l) => !!l) as T[];
    }),
  );
