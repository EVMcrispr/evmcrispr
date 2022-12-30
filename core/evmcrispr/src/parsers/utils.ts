import type { Ok, Parser } from 'arcsecond';
import {
  between,
  char,
  choice,
  coroutine,
  either,
  endOfInput,
  everyCharUntil,
  getData,
  lookAhead,
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

import type {
  Location,
  LocationData,
  Node,
  NodeParser,
  NodeParserState,
} from '../types';
import { buildParserError } from '../utils/parsers';
import { commentParser } from './comment';

export const createParserState = (): NodeParserState => ({
  line: 1,
  offset: 0,
  errors: [],
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
export const whitespace = regex(/^ +/).errorMap((err) =>
  buildParserError(err, 'ParserError', 'Expecting whitespace'),
);

export const optionalWhitespace = possibly(whitespace);

export const camelAndKebabCase = regex(/^(?!-)[a-zA-Z\d-]+(?<!-)/);

export const comma = char(',');
export const endOfLine = regex(/^\r?\n/);

export const baseEnclosingCharParsers = [endOfLine, endOfInput, whitespace];

export const enclosingLookaheadParser = (
  enclosingParsers: Parser<string, string, any>[] = [],
): Parser<any, string, any> =>
  lookAhead(choice([...baseEnclosingCharParsers, ...enclosingParsers]));

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

const defaultEndingParser = possibly(
  sequenceOf([optionalWhitespace, endOfInput]).map(
    () => 'DEFAULT_END_OF_INPUT',
  ),
);
export const linesParser = <T = Node>(
  lineParser: NodeParser<T>,
  endingParser: Parser<any, string, any>,
  {
    endingChar,
    parserErrorType,
    initialIndex,
    initialState,
  }: {
    endingChar: string;
    parserErrorType: string;
    initialState: NodeParserState;
    initialIndex: number;
  } = {
    endingChar: '',
    parserErrorType: 'ParserError',
    initialState: { errors: [], line: 0, offset: 0 },
    initialIndex: 0,
  },
): NodeParser<T[]> =>
  recursiveParser(() =>
    coroutine(function* () {
      const lines = [];
      let res: { isError: boolean; value: any };
      const parsers = endingParser
        ? [endingParser, defaultEndingParser]
        : [defaultEndingParser];
      let endOfParse = (yield possibly(choice(parsers))) as unknown;

      while (!endOfParse) {
        res = (yield either(
          choice([lineParser, emptyLine, commentParser.map(() => null)]),
        )) as unknown as { isError: boolean; value: any };

        if (res.isError) {
          yield addNewError(res.value);
          yield everyCharUntil(
            choice(
              endingParser
                ? [endingParser, endOfLine, endOfInput]
                : [endOfLine, endOfInput],
            ),
          );
          if (yield possibly(lookAhead(endOfLine))) {
            yield endLine;
          }
        } else if (res.value !== null) {
          lines.push(res.value);
        }

        endOfParse = (yield possibly(choice(parsers))) as unknown;
      }

      if (endingParser && endOfParse === 'DEFAULT_END_OF_INPUT') {
        yield addNewError(
          buildParserError(
            {
              data: initialState,
              index: initialIndex,
              error: '',
              isError: true,
            },
            parserErrorType,
            `Expecting closing ${
              endingChar ? `"${endingChar}"` : 'character'
            }, but got end of input`,
          ),
        );
      }

      return lines as T[];
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

export const addNewError = (
  error: string,
): Parser<any, string, NodeParserState> =>
  getData.chain<any>((state: NodeParserState) =>
    setData<any, string, NodeParserState>({
      ...state,
      errors: [...state.errors, error],
    }),
  );

export const endLine = sequenceOf([
  endOfLine,
  currentContexDataParser.chain((context) => addNewLine(context!.index)),
]);

export const emptyLine = sequenceOf([optionalWhitespace, endLine])
  .map(() => null)
  .errorMap((err) =>
    buildParserError(err, 'LineParserError', 'Expecting empty line'),
  );

export const locate = <N extends Node = Node>(
  p: Parser<any[], string, NodeParserState>,
  createNode: (data: Ok<[LocationData, any[]], NodeParserState>) => N,
): Parser<N, string, any> =>
  recursiveParser(() =>
    sequenceOf<LocationData, any[]>([
      currentContexDataParser,
      p,
    ]).mapFromData<N>(createNode),
  );
