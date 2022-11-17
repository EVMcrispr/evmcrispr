import type { Parser } from 'arcsecond';
import {
  choice,
  coroutine,
  letters,
  possibly,
  recursiveParser,
  regex,
} from 'arcsecond';

import type {
  CallExpressionNode,
  LocationData,
  NodeParser,
  NodeParserState,
} from '../types';
import { NodeType } from '../types';

import {
  addressParser,
  probableIdentifierParser,
  variableIdentifierParser,
} from './primaries';
import { argumentsParser } from './expression';
import { helperFunctionParser } from './helper';
import {
  callOperatorParser,
  createNodeLocation,
  currentContexDataParser,
} from './utils';
import { buildParserError } from '../utils/parsers';

const chainedCallExpressionParser = (
  target: CallExpressionNode,
): Parser<CallExpressionNode, string, NodeParserState> =>
  recursiveParser(() =>
    coroutine(function* () {
      const initialContext =
        (yield currentContexDataParser) as unknown as LocationData;

      const method = (yield letters) as unknown as CallExpressionNode['method'];

      const args =
        (yield argumentsParser) as unknown as CallExpressionNode['args'];

      const finalContext =
        (yield currentContexDataParser) as unknown as LocationData;

      const n: CallExpressionNode = {
        type: NodeType.CallExpression,
        target,
        method,
        args,
        loc: createNodeLocation(initialContext, finalContext),
      };

      // Check for further chained call expressions
      if (yield possibly(callOperatorParser)) {
        const chainedNode = (yield chainedCallExpressionParser(
          n,
        )) as unknown as CallExpressionNode;
        return chainedNode;
      }

      return n;
    }),
  );

const enclosingParsers = [callOperatorParser];

const callableExpressions = choice([
  addressParser(enclosingParsers),
  variableIdentifierParser(enclosingParsers),
  helperFunctionParser,
  probableIdentifierParser(enclosingParsers),
]);

export const callExpressionParser: NodeParser<CallExpressionNode> =
  recursiveParser(() =>
    coroutine(function* () {
      const initialContext =
        (yield currentContexDataParser) as unknown as LocationData;
      const target =
        (yield callableExpressions) as unknown as CallExpressionNode['target'];

      yield callOperatorParser;

      const methodRegex = /^[a-zA-Z_{1}][a-zA-Z0-9_]+/;
      const method = (yield regex(
        methodRegex,
      )) as unknown as CallExpressionNode['method'];
      const args = (yield argumentsParser.errorMap((err) =>
        buildParserError(err, ''),
      )) as unknown as CallExpressionNode['args'];

      const finalContext =
        (yield currentContexDataParser) as unknown as LocationData;

      const n: CallExpressionNode = {
        type: NodeType.CallExpression,
        target,
        method,
        args,
        loc: createNodeLocation(initialContext, finalContext),
      };

      // Check for chained call expressions
      if (yield possibly(callOperatorParser)) {
        const chainedCallNode = (yield chainedCallExpressionParser(
          n,
        )) as unknown as CallExpressionNode;

        return chainedCallNode;
      }

      return n;
    }),
  );
