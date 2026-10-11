import type {
  Location,
  LocationData,
  Node,
  NodeParser,
  NodeParserState,
} from "@evmcrispr/sdk";
import { buildParserError, everyCharUntil, regex } from "@evmcrispr/sdk";
import type { Ok } from "arcsecond";
import {
  between,
  char,
  choice,
  coroutine,
  either,
  endOfInput,
  getData,
  lookAhead,
  Parser,
  possibly,
  recursiveParser,
  sequenceOf,
  setData,
  str,
  takeLeft,
  tapParser,
} from "arcsecond";
import { commentParser } from "./comment";

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

export const callOperatorParser = str("::");

/** The hop operator, and the only thing a call target has to stop at.
 *  Both hop kinds start with it: `::{…}` calls at composition time,
 *  `::!{…}` reads at assertion time. */
export const chainOperatorParser = callOperatorParser;

/** A hop operator plus its optional on-chain read marker, yielding whether
 *  the hop reads (`::!`) or calls (`::`).
 *
 *  The marker trails the operator rather than leading it, because a
 *  leading one would sit against whatever precedes the hop, where it
 *  cannot be told apart from the trailing `!` of an on-chain helper face:
 *  `@name!::{…}` splits as `@name!` + `::` or as `@name` + `!::`, and the
 *  grammar cannot see which was meant. After the operator there is nothing
 *  to collide with. */
export const hopOperatorParser: Parser<boolean, string, NodeParserState> =
  recursiveParser(() =>
    coroutine((run) => {
      run(callOperatorParser);
      return run(possibly(char("!"))) !== null;
    }),
  );

export const optOperatorParser = str("--");

// Overwrite arcsecond's parser as it ignores newline character
export const whitespace = regex(/^ +/).errorMap((err) =>
  buildParserError(err, "ParserError", "Expecting whitespace"),
);

export const optionalWhitespace = possibly(whitespace);

/**
 * Consumes any mix of spaces and newlines, updating `state.line` /
 * `state.offset` for each `\n` that is consumed (mirrors what `endLine`
 * does for top-level command parsing). Used inside grouped constructs
 * (`@h(...)`, `[...]`, `x::m(...)`, inline ABI `{...}`) where a newline
 * is just whitespace separating arguments.
 */
export const optionalMultilineWhitespace: Parser<
  null,
  string,
  NodeParserState
> = recursiveParser(() =>
  coroutine((run) => {
    while (true) {
      run(optionalWhitespace);
      const nl: string | null = run(possibly(endOfLine));
      if (nl === null) break;
      run(
        currentContexDataParser.chain((context) => addNewLine(context!.index)),
      );
    }
    return null;
  }),
);

export const camelAndKebabCase = regex(/^(?!-)[a-zA-Z\d-]+(?<!-)/);

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

export const spaceSeparated = <T = Node>(
  parser: NodeParser<T>,
): NodeParser<T[]> =>
  recursiveParser(() =>
    coroutine((run) => {
      const results: T[] = [];
      const first: T | null = run(possibly(parser));
      if (first === null) return results;
      results.push(first);
      while (run(possibly(whitespace))) {
        const item: T | null = run(possibly(parser));
        if (item === null) break;
        results.push(item);
      }
      return results;
    }),
  );

const defaultEndingParser = possibly(
  sequenceOf([optionalWhitespace, endOfInput]).map(
    () => "DEFAULT_END_OF_INPUT",
  ),
);
export const linesParser = <T = Node>(
  lineParser: NodeParser<T>,
  endingParser?: Parser<any, string, any>,
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
    endingChar: "",
    parserErrorType: "ParserError",
    initialState: { errors: [], line: 0, offset: 0 },
    initialIndex: 0,
  },
): NodeParser<T[]> =>
  recursiveParser(() =>
    coroutine((run) => {
      const lines = [];
      let res: { isError: boolean; value: any };
      const parsers = endingParser
        ? [endingParser, defaultEndingParser]
        : [defaultEndingParser];
      let endOfParse = run(possibly(choice(parsers)));

      while (!endOfParse) {
        res = run(
          either(
            choice([lineParser, emptyLine, commentParser.map(() => null)]),
          ),
        );

        if (res.isError) {
          run(addNewError(res.value));
          run(
            everyCharUntil(
              choice(
                endingParser
                  ? [endingParser, endOfLine, endOfInput]
                  : [endOfLine, endOfInput],
              ),
            ),
          );
          if (run(possibly(lookAhead(endOfLine)))) {
            run(endLine);
          }
        } else if (res.value !== null) {
          lines.push(res.value);
        }

        endOfParse = run(possibly(choice(parsers)));
      }

      if (endingParser && endOfParse === "DEFAULT_END_OF_INPUT") {
        run(
          addNewError(
            buildParserError(
              {
                data: initialState,
                index: initialIndex,
                error: "",
                isError: true,
              },
              parserErrorType,
              `Missing closing ${
                endingChar ? `"${endingChar}"` : "character"
              } — reached end of input before it was closed`,
            ),
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
    buildParserError(err, "LineParserError", "Expecting empty line"),
  );

/**
 * `parser`, remembering what it last gave and where.
 *
 * For a parser that a choice reaches twice at one position: a helper is
 * tried as the head of a call, and when no `::` follows it, again as a
 * helper. Parsed twice, so are its arguments, each twice in turn, and the
 * time doubles with every level of nesting. The second attempt starts from
 * the same input, position and state as the first, so it gives the same.
 */
export const remembered = <T>(
  parser: Parser<T, string, NodeParserState>,
): Parser<T, string, NodeParserState> => {
  type State = Parameters<typeof parser.p>[0];
  let last: { from: State; out: ReturnType<typeof parser.p> } | undefined;

  return new Parser((state) => {
    if (state.isError) return state;
    if (
      last &&
      last.from.dataView === state.dataView &&
      last.from.index === state.index &&
      last.from.data === state.data
    )
      // A failure carries the result it was reached with.
      return last.out.isError
        ? { ...last.out, result: state.result }
        : last.out;

    const out = parser.p(state);
    last = { from: state, out };
    return out;
  });
};

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
