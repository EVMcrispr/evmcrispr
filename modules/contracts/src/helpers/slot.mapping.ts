import { defineHelper, ErrorException, isHexString, Num } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { concat, keccak256, pad, toHex } from "viem";
import type Contracts from "..";

/** Encode a mapping key the way Solidity's storage layout does: value types
 *  are left-padded to 32 bytes; string/bytes keys hash as their raw bytes. */
function encodeKey(key: unknown): Hex {
  if (key instanceof Num) {
    if (!key.isInteger()) throw new ErrorException("key must be an integer");
    return toHex(BigInt.asUintN(256, key.toBigInt()), { size: 32 });
  }
  if (typeof key === "bigint") {
    return toHex(BigInt.asUintN(256, key), { size: 32 });
  }
  if (typeof key === "boolean") {
    return toHex(key ? 1n : 0n, { size: 32 });
  }
  if (typeof key === "string" && isHexString(key)) {
    // Hex up to 32 bytes is a value-type key (address, bytes32, uintN);
    // longer hex is a bytes-type key and hashes raw.
    return key.length > 66 ? (key as Hex) : pad(key as Hex, { size: 32 });
  }
  if (typeof key === "string") {
    return toHex(key);
  }
  throw new ErrorException("Cannot encode mapping key");
}

export default defineHelper<Contracts>({
  name: "slot.mapping",
  description:
    "Derive the storage slot of mapping[key] for a mapping declared at a base slot: keccak256(h(key) . base).",
  returnType: "bytes32",
  args: [
    {
      name: "base",
      type: "bytes32",
      description: "Declared slot of the mapping",
    },
    { name: "key", type: "any", description: "Mapping key" },
  ],
  async run(_, { base, key }) {
    return keccak256(concat([encodeKey(key), base as Hex]));
  },
});
