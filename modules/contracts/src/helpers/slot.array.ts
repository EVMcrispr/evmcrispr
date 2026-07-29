import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { keccak256, toHex } from "viem";
import type Contracts from "..";

export default defineHelper<Contracts>({
  name: "slot.array",
  description:
    "Derive the storage slot of element index of a dynamic array declared at a base slot: keccak256(base) + index.",
  returnType: "bytes32",
  args: [
    {
      name: "base",
      type: "bytes32",
      description: "Declared slot of the array",
    },
    { name: "index", type: "number", description: "Element index" },
  ],
  async run(_, { base, index }) {
    const i = Num(index);
    if (!i.isInteger() || i.toBigInt() < 0n) {
      throw new ErrorException("index must be a non-negative integer");
    }
    const start = BigInt(keccak256(base as Hex));
    return toHex(BigInt.asUintN(256, start + i.toBigInt()), { size: 32 });
  },
});
