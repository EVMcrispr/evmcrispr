import {
  char,
  choice,
  coroutine,
  lookAhead,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
  takeLeft,
} from 'arcsecond';

import type {
  ArgumentExpressionNode,
  HelperFunctionNode,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { buildParserError } from '../utils/parsers';
import { argumentExpressionParser } from './expression';
import {
  commaSeparated,
  enclosingLookaheadParser,
  optionalWhitespace,
} from './utils';

export const HELPER_PARSER_ERROR = 'HelperParserError';
const helperNameParser = takeLeft(regex(/^(?!-|\.)[a-zA-Z\-.]+(?<!-|\.)/))(
  choice([enclosingLookaheadParser, lookAhead(char('('))]),
).errorMap((err) =>
  buildParserError(err, HELPER_PARSER_ERROR, 'Expecting a helper name'),
);

export const helperFunctionParser: NodeParser<HelperFunctionNode> =
  recursiveParser(() =>
    coroutine(function* () {
      yield char('@');

      const name = (yield helperNameParser) as unknown as string;

      let args = null;

      if (yield possibly(sequenceOf([char('('), optionalWhitespace]))) {
        args = (yield commaSeparated(argumentExpressionParser).errorMap((err) =>
          buildParserError(err, HELPER_PARSER_ERROR),
        )) as unknown as ArgumentExpressionNode[];

        yield sequenceOf([optionalWhitespace, char(')')]).errorMap((err) =>
          buildParserError(err, HELPER_PARSER_ERROR),
        );
      }

      yield enclosingLookaheadParser;

      const n: HelperFunctionNode = {
        type: NodeType.HelperFunctionExpression,
        name,
        args: args === null ? [] : args,
      };

      return n;
    }),
  );
