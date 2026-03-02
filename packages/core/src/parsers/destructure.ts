import type {
  DestructurePatternNode,
  DestructureSlot,
  NodeParser,
} from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";
import { char, coroutine, possibly, recursiveParser, regex } from "arcsecond";
import { createNodeLocation, locate, optionalWhitespace } from "./utils";

/**
 * Matches `$variableName` and returns the full string (including $).
 * Uses the same character set as variableIdentifierParser.
 */
const destructureVariableParser = regex(/^\$(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/);

/**
 * Parses a single destructure slot:
 *   - `$variable` -> string
 *   - nested `[...]` -> DestructureSlot[]
 *   - empty (hole) -> null  (handled by the caller via `possibly`)
 */
const destructureSlotParser: NodeParser<DestructureSlot> = recursiveParser(() =>
  coroutine((run) => {
    const variable: string | null = run(possibly(destructureVariableParser));
    if (variable !== null) return variable as DestructureSlot;

    return run(slotsParser) as DestructureSlot;
  }),
) as NodeParser<DestructureSlot>;

/**
 * Parses a `[...]` destructure pattern with comma-separated slots.
 * Empty positions between commas are treated as holes (null).
 */
const slotsParser: NodeParser<DestructureSlot[]> = recursiveParser(() =>
  coroutine((run) => {
    run(char("["));
    run(optionalWhitespace);

    const slots: DestructureSlot[] = [];

    if (run(possibly(char("]")))) return slots;

    const firstSlot = run(possibly(destructureSlotParser));
    slots.push(firstSlot);

    run(optionalWhitespace);

    while (run(possibly(char(",")))) {
      run(optionalWhitespace);
      const slot = run(possibly(destructureSlotParser));
      slots.push(slot);
      run(optionalWhitespace);
    }

    run(char("]"));
    return slots;
  }),
);

/**
 * Top-level parser for a destructure pattern node: `[$a, $b]`, `[$a, [, $b]]`, etc.
 * Produces a `DestructurePatternNode` with location information.
 */
export const destructurePatternParser: NodeParser<DestructurePatternNode> =
  recursiveParser(() =>
    locate<DestructurePatternNode>(
      slotsParser,
      ({ data, index, result: [initialContext, slots] }) => ({
        type: NodeType.DestructurePattern,
        slots: slots as DestructureSlot[],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );
