import type { Ok, Parser } from 'arcsecond';
import {
  between,
  char,
  choice,
  coroutine,
  endOfInput,
  getData,
  lookAhead,
  many,
  possibly,
  recursiveParser,
  regex,
  sepBy,
  sequenceOf,
  setData,
  str,
  takeLeft,
  tapParser,
} from 'arcsecond';

import type { Location, Node, NodeParser } from '../types';

export type LocationData = { line: number; index: number; offset: number };

export type NodeParserState = {
  line: number;
  offset: number;
};

export const createParserState = (): NodeParserState => ({
  line: 1,
  offset: 0,
});

export const createNodeLocation = (
  initial: LocationData,
  final: LocationData,
): Location => {
  return {
    start: {
      line: initial.line,
      col: initial.index - initial.offset,
    },
    end: {
      line: final.line,
      col: final.index - final.offset,
    },
  };
};

export const callOperatorParser = str('::');

export const optOperatorParser = str('--');

// Overwrite arcsecond's parser as it ignores newline character
export const whitespace = regex(/^ +/);

export const optionalWhitespace = possibly(whitespace);

export const camelAndKebabCase = regex(/^(?!-)[a-zA-Z\d-]+(?<!-)/);

export const baseEnclosingCharParsers = [
  char(','),
  char(']'),
  char(')'),
  char('\n'),
  endOfInput,
  char(' '),
];

export const enclosingLookaheadParser = lookAhead(
  choice(baseEnclosingCharParsers),
);

export const enclose = (
  p: Parser<any, string, any>,
  encloseCharParsers: Parser<any, string, any>[] = [],
): Parser<any, string, NodeParserState> =>
  takeLeft(p)(
    lookAhead(choice([...baseEnclosingCharParsers, ...encloseCharParsers])),
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
      const lines = (yield many(
        choice([emptyLine, p]),
      )) as unknown as (null | T)[];

      return lines.filter((l) => !!l) as T[];
    }),
  );

export const openingCharParser = (
  c: string,
): Parser<[string, string | null], string, any> =>
  sequenceOf([char(c), optionalWhitespace]);

export const closingCharParser = (
  c: string,
): Parser<[string | null, string], string, any> =>
  sequenceOf([optionalWhitespace, char(c)]);

export const currentContexDataParser: Parser<
  LocationData,
  string,
  NodeParserState
> = tapParser<string, string, NodeParserState>(
  (value) => value,
).mapFromData<LocationData>(({ index, data: { line, offset } }) => ({
  line,
  index,
  offset,
}));

export const addNewLine = (
  offset: number,
): Parser<any, string, NodeParserState> =>
  getData.chain<any>((state) =>
    setData<any, string, NodeParserState>({
      ...state,
      line: state.line + 1,
      offset,
    }),
  );

export const endOfLine = sequenceOf([
  char('\n'),
  currentContexDataParser.chain((context) => addNewLine(context!.index)),
]);

export const emptyLine = sequenceOf([possibly(whitespace), endOfLine]).map(
  () => null,
);

export const locate = <N extends Node = Node>(
  p: Parser<any[], string, NodeParserState>,
  createNode: (data: Ok<[LocationData, any[]], NodeParserState>) => N,
): Parser<N, string, any> =>
  recursiveParser(() =>
    sequenceOf([currentContexDataParser, p]).mapFromData<N>(createNode),
  );
