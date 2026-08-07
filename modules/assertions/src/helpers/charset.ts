import { ErrorException } from "@evmcrispr/sdk";
import { encodeCombinator } from "../lib/combinators";
import { chainArgWithLens, combinatorCall } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

/**
 * Compile a character-class spec into the charsetCall bitmap: bit i set ⇔
 * byte value i allowed. `x-y` spans an inclusive byte range; a dash that is
 * not between two other bytes (leading or trailing) is the literal `-`.
 * The spec is processed as UTF-8 bytes, matching the byte-level check the
 * combinator performs.
 */
export function charsetMask(spec: string): bigint {
  const bytes = new TextEncoder().encode(spec);
  let mask = 0n;
  for (let i = 0; i < bytes.length; i++) {
    if (i + 2 < bytes.length && bytes[i + 1] === 0x2d /* - */) {
      const lo = bytes[i];
      const hi = bytes[i + 2];
      if (lo > hi) {
        throw new ErrorException(
          `invalid @charset! range "${spec.slice(i, i + 3)}" — the range is reversed`,
        );
      }
      for (let b = lo; b <= hi; b++) mask |= 1n << BigInt(b);
      i += 2;
    } else {
      mask |= 1n << BigInt(bytes[i]);
    }
  }
  return mask;
}

export default defineBangHelper({
  name: "charset!",
  description:
    "Whether every byte of the string return of a call is in a character class, checked on-chain — only-lowercase is @charset!(call `a-z`).",
  returnType: "bool",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) returning a string",
    },
    {
      name: "class",
      type: "string",
      description:
        "Allowed characters and ranges, e.g. `a-z0-9-` (a leading or trailing dash is the literal `-`)",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@charset! expects (call class), e.g. @charset!($token::symbol() "a-z0-9-")',
      );
    }
    const chain = await chainArgWithLens(ctx, "charset!", node.args[0]);
    const spec = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof spec !== "string" || spec.length === 0) {
      throw new ErrorException(
        '@charset! class must be a non-empty string of allowed characters and ranges, e.g. "a-z0-9-"',
      );
    }
    return combinatorCall(
      ctx,
      encodeCombinator("charsetCall", [
        chain.root,
        chain.calls,
        charsetMask(spec),
      ]),
      "Bool",
    );
  },
});
