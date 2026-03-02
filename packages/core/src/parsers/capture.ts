import type {
  DestructureSlot,
  EventCaptureNode,
  Node,
  NodeParser,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import {
  char,
  coroutine,
  lookAhead,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
  str,
} from "arcsecond";
import {
  createNodeLocation,
  locate,
  optionalWhitespace,
  whitespace,
} from "./utils";

export const CAPTURE_PARSER_ERROR = "CaptureParserError";

/**
 * Matches the `->` arrow token.
 */
const captureArrowParser = str("->");

/**
 * Look-ahead that checks for `->` without consuming it.
 */
export const captureArrowLookahead = lookAhead(
  sequenceOf([str("->"), whitespace]),
);

/**
 * Matches an event name: a PascalCase/camelCase identifier.
 */
const eventNameParser = regex(/^[a-zA-Z_][a-zA-Z0-9_]*/);

/**
 * Matches inline event param types inside parentheses.
 * e.g. `(uint,address)` -> ["uint", "address"]
 * e.g. `(uint256,(address,uint256)[])` -> ["uint256", "(address,uint256)[]"]
 *
 * Supports nested parentheses for tuple types.
 */
const eventParamsParser = coroutine((run) => {
  run(char("("));

  const innerContent: string = run(
    regex(/^(?:[^()]*(?:\((?:[^()]*(?:\([^()]*\))*[^()]*)*\))*[^()]*)*/),
  );
  run(char(")"));

  const params: string[] = [];
  let parenDepth = 0;
  let current = "";
  for (const ch of innerContent) {
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;

    if (ch === "," && parenDepth === 0) {
      params.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    params.push(current.trim());
  }

  return params;
});

/**
 * Matches `$variableName` and returns just the name (without $).
 */
const captureVariableParser = regex(/^\$[a-zA-Z_][a-zA-Z0-9_-]*/).map(
  (v: string) => v.slice(1),
);

/**
 * Parses a single capture destructure slot (variable names WITHOUT $):
 *   - `$variable` -> string (without $ prefix)
 *   - nested `[...]` -> DestructureSlot[]
 *   - empty (hole) -> null
 */
const captureSlotParser: NodeParser<DestructureSlot> = recursiveParser(() =>
  coroutine((run) => {
    const variable: string | null = run(possibly(captureVariableParser));
    if (variable !== null) return variable as DestructureSlot;

    return run(captureSlotsParser) as DestructureSlot;
  }),
) as NodeParser<DestructureSlot>;

/**
 * Parses a `[...]` destructure pattern for event captures.
 * Variable names are stored WITHOUT the $ prefix.
 */
const captureSlotsParser: NodeParser<DestructureSlot[]> = recursiveParser(() =>
  coroutine((run) => {
    run(char("["));
    run(optionalWhitespace);

    const slots: DestructureSlot[] = [];

    if (run(possibly(char("]")))) return slots;

    const firstSlot = run(possibly(captureSlotParser));
    slots.push(firstSlot);

    run(optionalWhitespace);

    while (run(possibly(char(",")))) {
      run(optionalWhitespace);
      const slot = run(possibly(captureSlotParser));
      slots.push(slot);
      run(optionalWhitespace);
    }

    run(char("]"));
    return slots;
  }),
);

/**
 * Matches the contract filter prefix: `$var:` or `0xADDRESS:`.
 * Returns a Node (VariableIdentifierNode or AddressLiteralNode).
 */
const contractFilterParser = coroutine((run) => {
  const varMatch = run(
    possibly(
      lookAhead(
        sequenceOf([
          regex(/^\$[a-zA-Z_][a-zA-Z0-9_]*/),
          char(":"),
          regex(/^[a-zA-Z]/),
        ]),
      ),
    ),
  );

  if (varMatch) {
    const varName: string = run(regex(/^\$[a-zA-Z_][a-zA-Z0-9_]*/));
    run(char(":"));
    return {
      type: NodeType.VariableIdentifier,
      value: varName,
    } as Node;
  }

  const addrMatch = run(
    possibly(
      lookAhead(
        sequenceOf([
          regex(/^0x[a-fA-F0-9]{40}/),
          char(":"),
          regex(/^[a-zA-Z]/),
        ]),
      ),
    ),
  );

  if (addrMatch) {
    const addr: string = run(regex(/^0x[a-fA-F0-9]{40}/));
    run(char(":"));
    return {
      type: NodeType.AddressLiteral,
      value: addr,
    } as Node;
  }

  return null;
});

/**
 * Matches a complete event capture clause:
 *   `-> (contractFilter:)? EventName(params)?#occurrence? [captures]`
 *
 * Examples:
 *   `-> Withdrawn [$amount]`
 *   `-> Withdrawn(uint,address) [$amount, $to]`
 *   `-> Withdrawn(address,uint) [, $amount]`
 *   `-> Withdrawn#1 [$secondAmount]`
 *   `-> $c:Withdrawn(uint,address) [, $to]`
 *   `-> Evt(uint,(address,uint)) [$x, [, $y]]`
 */
export const eventCaptureParser: NodeParser<EventCaptureNode> = recursiveParser(
  () =>
    locate<EventCaptureNode>(
      coroutine((run) => {
        run(captureArrowParser);
        run(whitespace);

        // Optional contract filter
        const filter: Node | null = run(contractFilterParser);

        // Event name
        const eventName: string = run(
          eventNameParser.errorMap((err) =>
            buildParserError(
              err,
              CAPTURE_PARSER_ERROR,
              "Expecting an event name",
            ),
          ),
        );

        // Optional inline event params
        const eventParams: string[] | null = run(possibly(eventParamsParser));

        // Optional occurrence selector #N
        let occurrence: number | undefined;
        const occStr: string | null = run(
          possibly(sequenceOf([char("#"), regex(/^\d+/)]).map(([, n]) => n)),
        );
        if (occStr !== null) {
          occurrence = parseInt(occStr, 10);
        }

        // Capture destructure pattern [...]
        run(whitespace);
        const captures: DestructureSlot[] = run(captureSlotsParser);

        return [filter, eventName, eventParams, occurrence, captures];
      }).errorMap((err) =>
        buildParserError(
          err,
          CAPTURE_PARSER_ERROR,
          "Expecting a valid event capture clause",
        ),
      ),
      ({
        data,
        index,
        result: [
          initialContext,
          [filter, eventName, eventParams, occurrence, captures],
        ],
      }) => {
        const node: EventCaptureNode = {
          type: NodeType.EventCapture,
          eventName: eventName as string,
          captures: captures as DestructureSlot[],
          loc: createNodeLocation(initialContext, {
            line: data.line,
            index,
            offset: data.offset,
          }),
        };

        if (filter) {
          node.contractFilter = filter as Node;
        }
        if (eventParams) {
          node.eventParams = eventParams as string[];
        }
        if (occurrence !== undefined) {
          node.occurrence = occurrence as number;
        }

        return node;
      },
    ),
);
