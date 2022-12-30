import {
  char,
  coroutine,
  lookAhead,
  possibly,
  recursiveParser,
  regex,
  takeLeft,
} from 'arcsecond';

import type {
  ArgumentExpressionNode,
  HelperFunctionNode,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { buildParserError } from '../utils/parsers';
import { argumentsParser } from './expression';
import {
  callOperatorParser,
  comma,
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
  openingCharParser,
} from './utils';

export const HELPER_PARSER_ERROR = 'HelperParserError';
const helperNameParser = takeLeft(regex(/^(?!-|\.)[a-zA-Z\-.]+(?<!-|\.)/))(
  enclosingLookaheadParser([
    char('('),
    comma,
    char(']'),
    callOperatorParser,
    char(')'),
  ]),
).errorMap((err) =>
  buildParserError(err, HELPER_PARSER_ERROR, 'Expecting a helper name'),
);

export const helperFunctionParser: NodeParser<HelperFunctionNode> =
  recursiveParser(() =>
    locate<HelperFunctionNode>(
      coroutine(function* () {
        yield char('@');

        const name = (yield helperNameParser) as unknown as string;

        let args = null;

        if (yield possibly(lookAhead(openingCharParser('(')))) {
          args = (yield argumentsParser.errorMap((err) =>
            buildParserError(err, HELPER_PARSER_ERROR),
          )) as unknown as ArgumentExpressionNode[];
        }

        return [name, args === null ? [] : args];
      }),
      ({ data, index, result: [initialContext, [name, args]] }) => ({
        type: NodeType.HelperFunctionExpression,
        name: name as HelperFunctionNode['name'],
        args: args as HelperFunctionNode['args'],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );
