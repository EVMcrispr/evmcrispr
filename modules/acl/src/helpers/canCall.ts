import {
  defineHelper,
  ErrorException,
  normalizeSignature,
} from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, toFunctionSelector } from "viem";
import type AccessControl from "..";
import { accessManagerAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "canCall",
  batchable: false,
  description:
    "Whether a caller can immediately call a restricted function of a contract managed by an AccessManager.",
  compileDescription: "Reads the immediate flag of the pair, not the delay.",
  returnType: "bool",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    { name: "caller", type: "address", description: "Calling account" },
    {
      name: "target",
      type: "address",
      description: "Managed contract address",
    },
    {
      name: "signature",
      type: "string",
      description: "Function signature (e.g. mint(address,uint256))",
    },
  ],
  async run(module, { manager, caller, target, signature }) {
    let selector: `0x${string}`;
    try {
      selector = toFunctionSelector(normalizeSignature(signature));
    } catch {
      throw new ErrorException(`invalid function signature: ${signature}`);
    }

    const client = await module.getClient();
    const [immediate] = await client.readContract({
      address: manager,
      abi: accessManagerAbi,
      functionName: "canCall",
      args: [caller, target, selector],
    });
    return immediate;
  },
  compile: async (ctx, node) => {
    // The signature names a function, so it is fixed when the script is
    // built; the manager, the caller and the target may be live.
    const signature = await ctx.interpreters.interpretNode(node.args[3]);
    let selector: `0x${string}`;
    try {
      selector = toFunctionSelector(normalizeSignature(String(signature)));
    } catch {
      throw new ErrorException(`invalid function signature: ${signature}`);
    }
    // (immediate, delay): the immediate flag is word 0.
    return callReadOperand(
      ctx,
      await readTarget(ctx, "canCall!", node.args[0]),
      getAbiItem({ abi: accessManagerAbi, name: "canCall" }) as AbiFunction,
      [node.args[1], node.args[2], { value: selector }],
      "Bool",
      0n,
    );
  },
});
