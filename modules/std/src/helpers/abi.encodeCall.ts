import { defineHelper, ErrorException, encodeCalldata } from "@evmcrispr/sdk";
import { concatParam } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { parseAbiItem, toFunctionSelector } from "viem";
import type Std from "..";
import { buildAbiParts, isLiveNode } from "../utils/abiParts";

export default defineHelper<Std>({
  name: "abi.encodeCall",
  description: "ABI-encode a function call from its signature and arguments.",
  compileDescription:
    "The signature must be a constant; live arguments must be elementary static types, each contributing its 32-byte word (at most 4 per call).",
  returnType: "bytes",
  args: [
    {
      name: "signature",
      type: "write-abi",
      description: "Function signature (e.g. `transfer(address,uint256)`)",
    },
    {
      name: "params",
      type: "any",
      description: "Arguments to encode",
      rest: true,
    },
  ],
  async run(_, { signature, params }) {
    const bare = signature.startsWith("function ")
      ? signature.slice(9)
      : signature;
    const fnABI = parseAbiItem(`function ${bare}`) as AbiFunction;
    return encodeCalldata(fnABI, params);
  },
  // Unlike the `::!` chain operator, which PERFORMS a constructed read,
  // this face produces the calldata as a bytes VALUE — the constant
  // selector seeds the first concat run and each argument appends its
  // head word, so the whole call is one concat.
  compile: async (ctx, node) => {
    const [sigNode, ...paramNodes] = node.args;
    if (!sigNode || isLiveNode(sigNode)) {
      throw new ErrorException(
        "@abi.encodeCall! signature must be a constant string",
      );
    }
    const signature = String(await ctx.interpreters.interpretNode(sigNode));
    const bare = signature.startsWith("function ")
      ? signature.slice(9)
      : signature;
    let fnABI: AbiFunction;
    try {
      fnABI = parseAbiItem(`function ${bare}`) as AbiFunction;
    } catch (_err) {
      throw new ErrorException(
        `@abi.encodeCall! invalid signature: \`${signature}\``,
      );
    }
    if (fnABI.inputs.length !== paramNodes.length) {
      throw new ErrorException(
        `@abi.encodeCall! expected ${fnABI.inputs.length} argument(s), got ${paramNodes.length}`,
      );
    }
    if (!paramNodes.some(isLiveNode)) {
      const values: unknown[] = [];
      for (const n of paramNodes)
        values.push(await ctx.interpreters.interpretNode(n));
      try {
        return {
          kind: "const",
          cat: "Bytes",
          value: encodeCalldata(fnABI, values as never),
        };
      } catch (err) {
        throw new ErrorException(`@abi.encodeCall! ${(err as Error).message}`);
      }
    }
    const parts = await buildAbiParts(
      ctx,
      fnABI.inputs.map((p) => p.type),
      paramNodes,
      "head",
      "abi.encodeCall!",
      toFunctionSelector(fnABI).slice(2),
    );
    return { kind: "call", param: concatParam(ctx, parts), cat: "Bytes" };
  },
});
