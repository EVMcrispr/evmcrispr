import {
  coerceArgType,
  defineHelper,
  ErrorException,
  NodeType,
  Num,
} from "@evmcrispr/sdk";
import {
  compileOperand,
  isBangHelperNode,
  materializeWord,
  rawParam,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import { keccak256, pad, toHex } from "viem";
import type Contracts from "..";

export default defineHelper<Contracts>({
  name: "slot.array",
  description:
    "Derive the storage slot of element index of a dynamic array declared at a base slot: keccak256(base) + index.",
  compileDescription:
    "The base slot must be a constant; the index may be live, e.g. a length read. Reading the slot on-chain needs a target with an extsload-style getter.",
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
  // keccak256(base) folds at composition (the base is constant), so a
  // live index costs exactly one add. The plain face wraps mod 2^256
  // where the on-chain add is checked — unreachable for any real index.
  compile: async (ctx, node) => {
    const [baseNode, indexNode] = node.args;
    if (
      !baseNode ||
      baseNode.type === NodeType.CallExpression ||
      isBangHelperNode(baseNode)
    ) {
      throw new ErrorException(
        "@slot.array! base slot must be a constant — it names a position in a declared storage layout",
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
    const start = keccak256(base);
    if (
      !indexNode ||
      (indexNode.type !== NodeType.CallExpression &&
        !isBangHelperNode(indexNode))
    ) {
      const i = Num(await ctx.interpreters.interpretNode(indexNode));
      if (!i.isInteger() || i.toBigInt() < 0n) {
        throw new ErrorException("index must be a non-negative integer");
      }
      return {
        kind: "const",
        cat: "Bytes32",
        value: toHex(BigInt.asUintN(256, BigInt(start) + i.toBigInt()), {
          size: 32,
        }),
      };
    }
    const o = await compileOperand(ctx, indexNode);
    if (o.kind !== "call") {
      throw new ErrorException(
        "@slot.array! could not compile the index — pass it as a plain constant",
      );
    }
    return {
      kind: "call",
      param: wordOpParam(
        ctx,
        "add",
        false,
        rawParam(start),
        materializeWord(ctx, o),
      ),
      cat: "Bytes32",
    };
  },
});
