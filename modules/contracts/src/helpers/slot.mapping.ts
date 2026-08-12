import {
  coerceArgType,
  defineHelper,
  ErrorException,
  isHexString,
  NodeType,
  Num,
} from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  concatParam,
  hashParamOf,
  isBangHelperNode,
  wordPartParam,
} from "@evmcrispr/sdk/onchain";
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
  compileDescription:
    "The base slot must be a constant; the key may be live. Reading the slot on-chain needs a target with an extsload-style getter.",
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
  // A live word key is ABI left-padded like encodeKey pads value types
  // (two's-complement words match asUintN); a live string/bytes key
  // contributes its decoded payload, like encodeKey hashing raw bytes.
  // Either way the slot is keccak over one concatenation.
  compile: async (ctx, node) => {
    const [baseNode, keyNode] = node.args;
    if (
      !baseNode ||
      baseNode.type === NodeType.CallExpression ||
      isBangHelperNode(baseNode)
    ) {
      throw new ErrorException(
        "@slot.mapping! base slot must be a constant — it names a position in a declared storage layout",
      );
    }
    const base = pad(
      String(
        coerceArgType(
          await ctx.interpreters.interpretNode(baseNode),
          "bytes32",
        ),
      ) as Hex,
      { size: 32 },
    );
    if (
      !keyNode ||
      (keyNode.type !== NodeType.CallExpression && !isBangHelperNode(keyNode))
    ) {
      const key = await ctx.interpreters.interpretNode(keyNode);
      return {
        kind: "const",
        cat: "Bytes32",
        value: keccak256(concat([encodeKey(key), base])),
      };
    }
    const o = await compileOperand(ctx, keyNode);
    if (o.kind !== "call") {
      throw new ErrorException(
        "@slot.mapping! could not compile the key — pass it as a plain constant",
      );
    }
    const keyPart: BytesPart =
      o.cat === "String" || o.cat === "Bytes"
        ? o.param
        : { param: wordPartParam(ctx, o.param), size: 32 };
    return {
      kind: "call",
      param: hashParamOf(ctx, concatParam(ctx, [keyPart, base])),
      cat: "Bytes32",
    };
  },
});
