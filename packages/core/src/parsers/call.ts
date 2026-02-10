import type { Parser } from "arcsecond";
import {
  choice,
  coroutine,
  letters,
  possibly,
  recursiveParser,
  regex,
} from "arcsecond";

import type {
  CallExpressionNode,
  LocationData,
  NodeParser,
  NodeParserState,
} from "../types";
import { NodeType } from "../types";
import { buildParserError } from "../utils/parsers";
import { argumentsParser } from "./expression";
import { helperFunctionParser } from "./helper";
import {
  addressParser,
  probableIdentifierParser,
  variableIdentifierParser,
} from "./primaries";
import {
  callOperatorParser,
  createNodeLocation,
  currentContexDataParser,
} from "./utils";

const chainedCallExpressionParser = (
  target: CallExpressionNode,
): Parser<CallExpressionNode, string, NodeParserState> =>
  recursiveParser(() =>
    coroutine((run) => {
      const initialContext: LocationData = run(currentContexDataParser);

      const method: CallExpressionNode["method"] = run(letters);

      const args: CallExpressionNode["args"] = run(argumentsParser);

      const finalContext: LocationData = run(currentContexDataParser);

      const n: CallExpressionNode = {
        type: NodeType.CallExpression,
        target,
        method,
        args,
        loc: createNodeLocation(initialContext, finalContext),
      };

      // Check for further chained call expressions
      if (run(possibly(callOperatorParser))) {
        const chainedNode: CallExpressionNode = run(
          chainedCallExpressionParser(n),
        );
        return chainedNode;
      }

      return n;
    }),
  );

const enclosingParsers = [callOperatorParser];

const callableExpressions = recursiveParser(() =>
  choice([
    addressParser(enclosingParsers),
    variableIdentifierParser(enclosingParsers),
    helperFunctionParser,
    probableIdentifierParser(enclosingParsers),
  ]),
);

export const callExpressionParser: NodeParser<CallExpressionNode> =
  recursiveParser(() =>
    coroutine((run) => {
      const initialContext: LocationData = run(currentContexDataParser);
      const target: CallExpressionNode["target"] = run(callableExpressions);

      run(callOperatorParser);

      const methodRegex = /^[a-zA-Z_{1}][a-zA-Z0-9_]+/;
      const method: CallExpressionNode["method"] = run(regex(methodRegex));
      const args: CallExpressionNode["args"] = run(
        argumentsParser.errorMap((err) => buildParserError(err, "")),
      );

      const finalContext: LocationData = run(currentContexDataParser);

      const n: CallExpressionNode = {
        type: NodeType.CallExpression,
        target,
        method,
        args,
        loc: createNodeLocation(initialContext, finalContext),
      };

      // Check for chained call expressions
      if (run(possibly(callOperatorParser))) {
        const chainedCallNode: CallExpressionNode = run(
          chainedCallExpressionParser(n),
        );

        return chainedCallNode;
      }

      return n;
    }),
  );
