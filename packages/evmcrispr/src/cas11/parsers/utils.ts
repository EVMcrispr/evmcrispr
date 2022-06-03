import type { Parser } from 'arcsecond';
import { between, char, possibly, regex, sepBy, sequenceOf } from 'arcsecond';

export const endOfLine = char('\n');

// Overwrite arcsecond's parser as it ignores newline character
export const whitespace = regex(/^ +/);

export const optionalWhitespace = possibly(whitespace);

export const emptyLine = sequenceOf([possibly(whitespace), endOfLine]);

export const surroundedBy = (
  parser: Parser<any, any, any>,
): ((p: Parser<unknown, string, any>) => Parser<unknown, any, any>) =>
  between(parser)(parser);

export const commaSeparated = sepBy(
  surroundedBy(optionalWhitespace)(char(',')),
);
