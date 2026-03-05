import type {
  CallExpressionNode,
  DestructureSlot,
  LocationData,
  NodeParser,
  NodeParserState,
} from "@evmcrispr/sdk";
import { balancedParens, buildParserError, NodeType } from "@evmcrispr/sdk";
import type { Parser } from "arcsecond";
import {
  char,
  choice,
  coroutine,
  letters,
  possibly,
  recursiveParser,
  regex,
} from "arcsecond";
import { argumentExpressionParser, argumentsParser } from "./expression";
import { helperFunctionParser } from "./helper";
import {
  addressParser,
  barewordParser,
  variableIdentifierParser,
} from "./primaries";
import {
  callOperatorParser,
  createNodeLocation,
  currentContexDataParser,
  optionalWhitespace,
  whitespace,
} from "./utils";

// ---------------------------------------------------------------------------
// Return-value destructure lens: [,[[,$]]]
// Bare `$` = "take this value", null = skip, nested [...] = descend.
// ---------------------------------------------------------------------------

const returnLensSlotParser: NodeParser<DestructureSlot> = recursiveParser(() =>
  coroutine((run) => {
    const dollar: string | null = run(possibly(char("$")));
    if (dollar !== null) return "$" as DestructureSlot;

    return run(returnLensSlotsParser) as DestructureSlot;
  }),
) as NodeParser<DestructureSlot>;

const returnLensSlotsParser: NodeParser<DestructureSlot[]> = recursiveParser(
  () =>
    coroutine((run) => {
      run(char("["));
      run(optionalWhitespace);

      const slots: DestructureSlot[] = [];

      if (run(possibly(char("]")))) return slots;

      const firstSlot = run(possibly(returnLensSlotParser));
      slots.push(firstSlot);
      run(optionalWhitespace);

      while (run(possibly(char(",")))) {
        run(optionalWhitespace);
        const slot = run(possibly(returnLensSlotParser));
        slots.push(slot);
        run(optionalWhitespace);
      }

      run(char("]"));
      return slots;
    }),
);

// ---------------------------------------------------------------------------
// Inline ABI call: ::{method(inputs)(outputs) arg1 arg2 ...}
// ---------------------------------------------------------------------------

type InlineAbiResult = {
  method: string;
  inputTypes: string;
  outputTypes: string;
  args: CallExpressionNode["args"];
};

const inlineAbiMethodNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*/;

const _inlineAbiCallParser: NodeParser<InlineAbiResult> = recursiveParser(() =>
  coroutine((run) => {
    run(char("{"));

    const method: string = run(regex(inlineAbiMethodNameRegex));
    const inputTypes: string = run(balancedParens);
    const outputTypes: string = run(balancedParens);

    const args: CallExpressionNode["args"] = [];

    while (run(possibly(whitespace))) {
      const arg = run(possibly(argumentExpressionParser([char("}")])));
      if (arg === null) break;
      args.push(arg);
    }

    run(char("}"));

    return { method, inputTypes, outputTypes, args } as InlineAbiResult;
  }),
) as NodeParser<InlineAbiResult>;

// ---------------------------------------------------------------------------
// Chained call expression (after the first :: in a chain)
// ---------------------------------------------------------------------------

const chainedCallExpressionParser = (
  target: CallExpressionNode,
): Parser<CallExpressionNode, string, NodeParserState> =>
  recursiveParser(() =>
    coroutine((run) => {
      const initialContext: LocationData = run(currentContexDataParser);

      let n: CallExpressionNode;

      const isInlineAbi: string | null = run(possibly(char("{")));

      if (isInlineAbi !== null) {
        const method: string = run(regex(inlineAbiMethodNameRegex));
        const inputTypes: string = run(balancedParens);
        const outputTypes: string = run(balancedParens);

        const args: CallExpressionNode["args"] = [];
        while (run(possibly(whitespace))) {
          const arg = run(possibly(argumentExpressionParser([char("}")])));
          if (arg === null) break;
          args.push(arg);
        }
        run(char("}"));

        const finalContext: LocationData = run(currentContexDataParser);
        n = {
          type: NodeType.CallExpression,
          target,
          method,
          args,
          inputTypes,
          outputTypes,
          loc: createNodeLocation(initialContext, finalContext),
        };
      } else {
        const method: CallExpressionNode["method"] = run(letters);
        const args: CallExpressionNode["args"] = run(argumentsParser);
        const finalContext: LocationData = run(currentContexDataParser);
        n = {
          type: NodeType.CallExpression,
          target,
          method,
          args,
          loc: createNodeLocation(initialContext, finalContext),
        };
      }

      // Optional return destructure lens
      const lens: DestructureSlot[] | null = run(
        possibly(returnLensSlotsParser),
      );
      if (lens !== null) {
        n.returnDestructure = lens;
        const afterLens: LocationData = run(currentContexDataParser);
        n.loc = createNodeLocation(initialContext, afterLens);
      }

      if (run(possibly(callOperatorParser))) {
        return run(chainedCallExpressionParser(n));
      }

      return n;
    }),
  );

// ---------------------------------------------------------------------------
// Top-level call expression
// ---------------------------------------------------------------------------

const enclosingParsers = [callOperatorParser];

const callableExpressions = recursiveParser(() =>
  choice([
    addressParser(enclosingParsers),
    variableIdentifierParser(enclosingParsers),
    helperFunctionParser,
    barewordParser(enclosingParsers),
  ]),
);

export const callExpressionParser: NodeParser<CallExpressionNode> =
  recursiveParser(() =>
    coroutine((run) => {
      const initialContext: LocationData = run(currentContexDataParser);
      const target: CallExpressionNode["target"] = run(callableExpressions);

      run(callOperatorParser);

      let n: CallExpressionNode;

      const isInlineAbi: string | null = run(possibly(char("{")));

      if (isInlineAbi !== null) {
        const method: string = run(regex(inlineAbiMethodNameRegex));
        const inputTypes: string = run(balancedParens);
        const outputTypes: string = run(balancedParens);

        const args: CallExpressionNode["args"] = [];
        while (run(possibly(whitespace))) {
          const arg = run(possibly(argumentExpressionParser([char("}")])));
          if (arg === null) break;
          args.push(arg);
        }
        run(char("}"));

        const finalContext: LocationData = run(currentContexDataParser);
        n = {
          type: NodeType.CallExpression,
          target,
          method,
          args,
          inputTypes,
          outputTypes,
          loc: createNodeLocation(initialContext, finalContext),
        };
      } else {
        const methodRegex = /^[a-zA-Z_{1}][a-zA-Z0-9_]+/;
        const method: CallExpressionNode["method"] = run(regex(methodRegex));
        const args: CallExpressionNode["args"] = run(
          argumentsParser.errorMap((err) => buildParserError(err, "")),
        );
        const finalContext: LocationData = run(currentContexDataParser);
        n = {
          type: NodeType.CallExpression,
          target,
          method,
          args,
          loc: createNodeLocation(initialContext, finalContext),
        };
      }

      // Optional return destructure lens
      const lens: DestructureSlot[] | null = run(
        possibly(returnLensSlotsParser),
      );
      if (lens !== null) {
        n.returnDestructure = lens;
        const afterLens: LocationData = run(currentContexDataParser);
        n.loc = createNodeLocation(initialContext, afterLens);
      }

      if (run(possibly(callOperatorParser))) {
        return run(chainedCallExpressionParser(n));
      }

      return n;
    }),
  );
