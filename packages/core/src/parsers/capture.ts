import type {
  EventCaptureBinding,
  EventCaptureNode,
  Node,
  NodeParser,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import {
  char,
  choice,
  coroutine,
  lookAhead,
  many1,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
  str,
} from "arcsecond";
import { createNodeLocation, locate, whitespace } from "./utils";

export const CAPTURE_PARSER_ERROR = "CaptureParserError";

/**
 * Matches the `->` arrow token.
 */
const captureArrowParser = str("->");

/**
 * Matches an event name: a PascalCase/camelCase identifier.
 * Stops at `(`, `#`, `:`, whitespace, end of line, or end of input.
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

  // Match everything inside parens (supporting nested parens for tuples)
  const innerContent: string = run(
    regex(/^(?:[^()]*(?:\((?:[^()]*(?:\([^()]*\))*[^()]*)*\))*[^()]*)*/),
  );
  run(char(")"));

  // Split by top-level commas (not inside nested parens)
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
const captureVariableParser = regex(/^\$[a-zA-Z_][a-zA-Z0-9_]*/).map(
  (v: string) => v.slice(1), // strip the $
);

/**
 * Matches a numeric index path like `:1` or `:1:0:2`.
 * Returns an array of numbers.
 */
const indexPathParser = many1(
  sequenceOf([char(":"), regex(/^\d+/)]).map(([, num]) => parseInt(num, 10)),
);

/**
 * Matches a named field accessor like `.amount` optionally followed by index path.
 * Returns { fieldName, indexPath }.
 */
const namedAccessorParser = coroutine((run) => {
  run(char("."));
  const fieldName: string = run(regex(/^[a-zA-Z_][a-zA-Z0-9_]*/));
  const subPath: number[] | null = run(possibly(indexPathParser));
  return { fieldName, indexPath: subPath ?? [] };
});

/**
 * Matches a single capture binding:
 *   - `$var` (implicit index 0)
 *   - `:1 $var` (explicit index)
 *   - `:1:0:1 $var` (deep index path)
 *   - `.fieldName $var` (named access)
 *   - `.fieldName:0:1 $var` (named + sub-path)
 */
const captureBindingParser: NodeParser<EventCaptureBinding> = coroutine(
  (run) => {
    // Try named accessor first
    const named = run(possibly(namedAccessorParser));
    if (named) {
      run(whitespace);
      const variable: string = run(captureVariableParser);
      return {
        indexPath: named.indexPath,
        fieldName: named.fieldName,
        variable,
      } as EventCaptureBinding;
    }

    // Try index path
    const idxPath: number[] | null = run(possibly(indexPathParser));
    if (idxPath) {
      run(whitespace);
      const variable: string = run(captureVariableParser);
      return {
        indexPath: idxPath,
        variable,
      } as EventCaptureBinding;
    }

    // Just a variable (implicit index 0)
    const variable: string = run(captureVariableParser);
    return {
      indexPath: [],
      variable,
    } as EventCaptureBinding;
  },
) as NodeParser<EventCaptureBinding>;

/**
 * Matches the contract filter prefix: `$var:` or `0xADDRESS:`.
 * Returns a Node (VariableIdentifierNode or AddressLiteralNode).
 */
const contractFilterParser = coroutine((run) => {
  // Try $variable: first
  const varMatch = run(
    possibly(
      lookAhead(
        sequenceOf([
          regex(/^\$[a-zA-Z_][a-zA-Z0-9_]*/),
          char(":"),
          regex(/^[a-zA-Z]/), // must be followed by alpha (event name)
        ]),
      ),
    ),
  );

  if (varMatch) {
    const varName: string = run(regex(/^\$[a-zA-Z_][a-zA-Z0-9_]*/));
    run(char(":"));
    return {
      type: NodeType.VariableIdentifier,
      value: varName, // keep the $ for interpretation
    } as Node;
  }

  // Try 0xADDRESS: next
  const addrMatch = run(
    possibly(
      lookAhead(
        sequenceOf([
          regex(/^0x[a-fA-F0-9]{40}/),
          char(":"),
          regex(/^[a-zA-Z]/), // must be followed by alpha (event name)
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
 *   `-> (contractFilter:)? EventName(params)?#occurrence? captureBindings+`
 *
 * Examples:
 *   `-> Withdrawn $amount`
 *   `-> Withdrawn:1 $to`
 *   `-> Withdrawn $amount :1 $to`
 *   `-> Withdrawn(uint,address) $amount`
 *   `-> Withdrawn#1 $secondAmount`
 *   `-> $c:Withdrawn(uint,address):1 $to`
 *   `-> 0xabc...def:Transfer $amount`
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

        // Capture bindings (at least one required)
        const captures: EventCaptureBinding[] = [];

        // Check if there's an accessor attached directly to the event selector
        // (no space), e.g. `Withdrawn:1 $to` or `Withdrawn(uint):1 $to`
        const attachedIndexPath: number[] | null = run(
          possibly(indexPathParser),
        );
        const attachedNamed = !attachedIndexPath
          ? run(possibly(namedAccessorParser))
          : null;

        if (attachedIndexPath || attachedNamed) {
          // There's an attached accessor; the variable follows after whitespace
          run(whitespace);
          const variable: string = run(captureVariableParser);
          captures.push(
            attachedNamed
              ? {
                  indexPath: attachedNamed.indexPath,
                  fieldName: attachedNamed.fieldName,
                  variable,
                }
              : {
                  indexPath: attachedIndexPath!,
                  variable,
                },
          );
        } else {
          // No attached accessor; whitespace then normal capture binding
          run(whitespace);
          const firstCapture: EventCaptureBinding = run(captureBindingParser);
          captures.push(firstCapture);
        }

        // Additional bindings: whitespace + (indexPath | namedAccessor | $var)
        let hasMore = true;
        while (hasMore) {
          // Check if next is another capture binding (after whitespace)
          // It must start with `:digit`, `.alpha`, or `$`
          const moreBinding = run(
            possibly(
              lookAhead(
                sequenceOf([
                  whitespace,
                  choice([
                    regex(/^:[0-9]/), // index path
                    regex(/^\.[a-zA-Z]/), // named accessor
                    regex(/^\$/), // variable
                  ]),
                ]),
              ),
            ),
          );

          if (moreBinding) {
            run(whitespace);
            const nextCapture: EventCaptureBinding = run(captureBindingParser);
            captures.push(nextCapture);
          } else {
            hasMore = false;
          }
        }

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
          captures: captures as EventCaptureBinding[],
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
