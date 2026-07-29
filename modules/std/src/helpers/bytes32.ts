import { defineHelper, ErrorException, isHexString, Num } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { pad, toHex } from "viem";
import type Std from "..";
import { evaluateArithmeticExpr, validateNoEmbeddedOps } from "./_expr";

function fromInteger(value: Num | bigint): string {
  if (value instanceof Num && !value.isInteger()) {
    throw new ErrorException("value must be an integer");
  }
  const big = value instanceof Num ? value.toBigInt() : value;
  return toHex(BigInt.asUintN(256, big), { size: 32 });
}

export default defineHelper<Std>({
  name: "bytes32",
  description:
    "Pad a value to a 32-byte hex string. Integers and arithmetic expressions are left-padded like Solidity's `bytes32(uint256(...))` cast; hex strings pad left by default or right with a trailing `right`.",
  returnType: "bytes32",
  args: [
    {
      name: "tokens",
      type: "any",
      rest: true,
      description:
        "Value or arithmetic expression, optionally followed by a `left`/`right` padding direction (hex strings only)",
    },
  ],
  async run(_, { tokens }) {
    const parts: unknown[] = [...(tokens ?? [])];
    let direction: "left" | "right" | undefined;
    const last = parts[parts.length - 1];
    if (last === "left" || last === "right") {
      direction = parts.pop() as "left" | "right";
    }
    if (parts.length === 0) {
      throw new ErrorException("@bytes32 requires a value");
    }

    if (parts.length > 1) {
      const num = evaluateArithmeticExpr(parts);
      if (direction === "right") {
        throw new ErrorException(
          "integers are always left-padded; right-padding only applies to hex strings",
        );
      }
      return fromInteger(num);
    }

    const value = parts[0];
    validateNoEmbeddedOps(value, "arithmetic");
    if (value instanceof Num || typeof value === "bigint") {
      if (direction === "right") {
        throw new ErrorException(
          "integers are always left-padded; right-padding only applies to hex strings",
        );
      }
      return fromInteger(value);
    }
    if (typeof value === "string" && isHexString(value)) {
      if (value.length > 66) {
        throw new ErrorException(
          `value is ${(value.length - 2) / 2} bytes, exceeds 32`,
        );
      }
      return pad(value as Hex, { size: 32, dir: direction ?? "left" });
    }
    throw new ErrorException(
      "value must be an integer or a hex string; encode text first with @bytes(value utf8)",
    );
  },
});
