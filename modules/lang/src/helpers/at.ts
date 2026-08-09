import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  chainArgWithLens,
  constIntArg,
  encodeNav,
  formatReturnTuple,
  staticCallParam,
  walkNavPath,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "at",
  description:
    "Access an element by index in an array. As @at! an element of the array return of a call, selected on-chain through a typed nav — negative indexes resolve against the live length at assertion time.",
  returnType: "any",
  args: [
    {
      name: "value",
      type: "array",
      description:
        "Input value (in @at! a `::` call expression or chain returning an array)",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based index (negative counts from end)",
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
