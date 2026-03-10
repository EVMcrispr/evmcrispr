import type {
  DestructurePatternNode,
  DestructureSlot,
  NodeParser,
} from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";
import {
  char,
  choice,
  coroutine,
  possibly,
  recursiveParser,
  regex,
} from "arcsecond";
import { createNodeLocation, locate, optionalWhitespace } from "./utils";

const destructureVariableParser = regex(/^\$(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/);

const holeParser = char("_").map(() => null);

const destructureSlotParser: NodeParser<DestructureSlot> = recursiveParser(() =>
  choice([holeParser, destructureVariableParser, slotsParser]),
) as NodeParser<DestructureSlot>;

/**
 * Parses a `[...]` destructure pattern with space-separated slots.
 * `_` marks a hole (null).
 */
const slotsParser: NodeParser<DestructureSlot[]> = recursiveParser(() =>
  coroutine((run) => {
    run(char("["));
    run(optionalWhitespace);

    const slots: DestructureSlot[] = [];

    if (run(possibly(char("]")))) return slots;

    slots.push(run(destructureSlotParser));
    run(optionalWhitespace);

    while (!run(possibly(char("]")))) {
      slots.push(run(destructureSlotParser));
      run(optionalWhitespace);
    }

    return slots;
  }),
);

/**
 * Top-level parser for a destructure pattern node: `[$a $b]`, `[_ $b]`, etc.
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
