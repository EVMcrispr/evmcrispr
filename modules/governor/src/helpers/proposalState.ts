import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Governor from "..";
import { governorAbi, toBigIntValue } from "../utils";

const PROPOSAL_STATES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

export default defineHelper<Governor>({
  name: "proposalState",
  batchable: false,
  description:
    "Current state of a Governor proposal: Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired or Executed.",
  compileDescription:
    "Returns the raw uint8 enum (0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued, 6 Expired, 7 Executed), not the name.",
  returnType: "string",
  args: [
    { name: "governor", type: "address", description: "Governor address" },
    { name: "proposalId", type: "number", description: "Proposal id" },
  ],
  async run(module, { governor, proposalId }) {
    const client = await module.getClient();
    const state = await client.readContract({
      address: governor,
      abi: governorAbi,
      functionName: "state",
      args: [toBigIntValue(proposalId)],
    });
    return PROPOSAL_STATES[state] ?? String(state);
  },
  compile: async (ctx, node) => {
    const governor = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    // The uint8 enum value; the string names stay off-chain.
    return callReadOperand(
      ctx,
      governor,
      getAbiItem({ abi: governorAbi, name: "state" }) as AbiFunction,
      [node.args[1]],
      "Uint",
    );
  },
});
