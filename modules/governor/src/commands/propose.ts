import {
  BindingsSpace,
  defineCommand,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import type Governor from "..";
import {
  collectBlockActions,
  governorAbi,
  hashDescription,
  hashProposalLocal,
} from "../utils";

/**
 * Resolve the proposal id the way the governor would: getProposalId (v5.3+)
 * covers sequential-id governors, hashProposal covers older ones, and the
 * local hash replica covers governors that expose neither.
 */
async function resolveProposalId(
  module: Governor,
  governor: Address,
  targets: Address[],
  values: bigint[],
  calldatas: Hex[],
  descriptionHash: Hex,
): Promise<bigint> {
  const client = await module.getClient();
  for (const functionName of ["getProposalId", "hashProposal"] as const) {
    try {
      return await client.readContract({
        address: governor,
        abi: governorAbi,
        functionName,
        args: [targets, values, calldatas, descriptionHash],
      });
    } catch {
      // fall through to the next resolution strategy
    }
  }
  return hashProposalLocal(targets, values, calldatas, descriptionHash);
}

export default defineCommand<Governor>({
  name: "propose",
  description:
    "Create a Governor proposal from a block of commands: each action in the block becomes one of the proposal calls. Optionally binds the proposal id to a variable.",
  args: [
    {
      name: "variable",
      type: "variable",
      optional: true,
      description: "Variable to bind the proposal id to",
    },
    { name: "governor", type: "address", description: "Governor address" },
    {
      name: "description",
      type: "string",
      description: "Proposal description (markdown)",
    },
    {
      name: "actions",
      type: "block",
      description: "Block of commands making up the proposal",
    },
  ],
  async run(
    module,
    { variable, governor, description, actions },
    { interpreters },
  ) {
    const { targets, values, calldatas } = await collectBlockActions(
      module.contextualName,
      "propose",
      actions,
      interpreters,
    );

    if (variable) {
      const proposalId = await resolveProposalId(
        module,
        governor,
        targets,
        values.map((v) => v.toBigInt()),
        calldatas,
        hashDescription(description),
      );
      module.bindingsManager.setBinding(
        variable,
        Num.fromBigInt(proposalId),
        BindingsSpace.USER,
        true,
        undefined,
        true,
      );
    }

    return [
      encodeAction(governor, "propose(address[],uint256[],bytes[],string)", [
        targets,
        values,
        calldatas,
        description,
      ]),
    ];
  },
});
