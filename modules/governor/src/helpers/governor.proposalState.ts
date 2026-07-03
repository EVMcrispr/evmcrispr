import { defineHelper } from "@evmcrispr/sdk";
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
  name: "governor.proposalState",
  batchable: false,
  description:
    "Current state of a Governor proposal: Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired or Executed.",
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
});
