import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  charsetParam,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

/**
 * Compile a character-class spec into the bitSet bitmap: bit i set ⇔ byte
 * value i allowed. `x-y` spans an inclusive byte range; a dash that is not
 * between two other bytes (leading or trailing) is the literal `-`. The
 * spec is processed as UTF-8 bytes, matching the byte-level fold the
 * Operators contract performs.
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
          `invalid @str.charset range "${spec.slice(i, i + 3)}" — the range is reversed`,
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

function requireSpec(spec: unknown): string {
  if (typeof spec !== "string" || spec.length === 0) {
    throw new ErrorException(
      '@str.charset class must be a non-empty string of allowed characters and ranges, e.g. "a-z0-9-"',
    );
  }
  return spec;
}

export default defineHelper<Lang>({
  name: "str.charset",
  description:
    "Check whether every byte of a string is in a character class (ranges like `a-z0-9-`; a leading or trailing dash is the literal `-`). As @str.charset! the string return of a call is checked on-chain with the same byte-level semantics.",
  returnType: "bool",
  args: [
    {
      name: "value",
      type: "string",
      description:
        "String to check (in @str.charset! a `::` call expression or chain returning a string)",
    },
    {
      name: "class",
      type: "string",
      description:
        "Allowed characters and ranges, e.g. `a-z0-9-` (a leading or trailing dash is the literal `-`)",
    },
  ],
  async run(_, args) {
    const mask = charsetMask(requireSpec(String(args.class)));
    // The same byte-class check the Operators contract folds over: every
    // UTF-8 byte of the value must have its bit set in the mask.
    const bytes = new TextEncoder().encode(String(args.value));
    for (const b of bytes) {
      if ((mask & (1n << BigInt(b))) === 0n) return "false";
    }
    return "true";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@str.charset! expects (call class), e.g. @str.charset!($token::symbol() "a-z0-9-")',
      );
    }
    const arg = await chainArgWithLens(ctx, "str.charset!", node.args[0]);
    requireBytesLike(arg, "str.charset!");
    const spec = requireSpec(
      await ctx.interpreters.interpretNode(node.args[1]),
    );
    return {
      kind: "call",
      param: charsetParam(ctx, lensedDataOperand(ctx, arg), charsetMask(spec)),
      cat: "Bool",
    };
  },
});
