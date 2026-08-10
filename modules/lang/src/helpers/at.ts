import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  chainArgWithLens,
  constIntArg,
  encodeNav,
  encodePick,
  formatReturnTuple,
  isBangHelperNode,
  staticCallParam,
  walkNavPath,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "at",
  description: "Access an element by index in an array.",
  returnType: "any",
  args: [
    {
      name: "value",
      type: "array",
      description: "Source array",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based index (negative counts from the end)",
    },
  ],
  async run(_, { value, index }) {
    const i = Num(index).toNumber();
    const resolved = i < 0 ? value.length + i : i;

    if (resolved < 0 || resolved >= value.length) {
      throw new ErrorException(
        `@at: index ${i} out of bounds for length ${value.length}`,
      );
    }

    return value[resolved];
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@at! expects (call index), e.g. @at!($safe::getOwners() 0)",
      );
    }
    if (node.args[0] && isBangHelperNode(node.args[0])) {
      // Nested array face: the payload resolves as a bytes value
      // [0x20][len][words…], so element i is a core pick of word i + 2
      // (negative indexes count words from the end of the resolved
      // bytes, which IS from the end of the payload). The element is an
      // untyped word — the face categories don't carry element types.
      const { payload } = await wordsArg(ctx, node.args[0], "at!");
      const index = await constIntArg(ctx, "at!", "index", node.args[1]);
      return {
        kind: "call",
        param: staticCallParam(
          ctx.core,
          encodePick(payload, index >= 0n ? index + 2n : index),
        ),
        cat: "Uint",
      };
    }
    const arg = await chainArgWithLens(ctx, "at!", node.args[0]);
    let base = arg.path;
    if (!base) {
      if (arg.outputs.length !== 1) {
        throw new ErrorException(
          "@at! needs a single array return value; select one with a lens",
        );
      }
      base = [0];
    }
    const { terminal: container } = walkNavPath(arg.outputs, base, "@at!");
    if (!/\[\d*\]$/.test(container.type)) {
      throw new ErrorException(
        `@at! needs an array value, got ${container.type}`,
      );
    }
    const index = await constIntArg(ctx, "at!", "index", node.args[1]);
    // The index becomes one more nav step: fixed-size arrays resolve
    // (and bounds-check) negative indexes at build time, dynamic arrays
    // keep them negative for the core's from-the-end resolution.
    const { terminal, resolved } = walkNavPath(
      arg.outputs,
      [...base, Number(index)],
      "@at!",
    );
    if (/\[\d*\]$/.test(terminal.type) || terminal.type.startsWith("tuple")) {
      throw new ErrorException(
        `@at! selects single values; the ${container.type} elements are ${terminal.type.startsWith("tuple") ? "structs" : "arrays"}`,
      );
    }
    return {
      kind: "call",
      param: staticCallParam(
        ctx.core,
        encodeNav(
          arg.param,
          formatReturnTuple(arg.outputs),
          resolved.map(BigInt),
        ),
      ),
      cat: categoryFromAbiType(terminal.type),
    };
  },
});
