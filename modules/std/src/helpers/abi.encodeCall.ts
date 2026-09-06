import { defineHelper, ErrorException, encodeCalldata } from "@evmcrispr/sdk";
import { concatParam } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { parseAbiItem, toFunctionSelector } from "viem";
import type Std from "..";
import { buildStandardEncoding, isLiveNode } from "../utils/abiParts";

export default defineHelper<Std>({
  name: "abi.encodeCall",
  description: "ABI-encode a function call from its signature and arguments.",
  compileDescription:
    "The signature must be constant; live arguments may include arrays and tuples.",
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
  // Canonical argument encoding plus the constant function selector.
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
    const encoded = await buildStandardEncoding(ctx, fnABI.inputs, paramNodes);
    return {
      kind: "call",
      param: concatParam(ctx, [toFunctionSelector(fnABI), encoded]),
      cat: "Bytes",
    };
  },
});
