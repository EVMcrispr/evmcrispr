import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Governor from "..";
import { collectBlockActions } from "../utils";

const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;

export default defineCommand<Governor>({
  name: "timelock-execute",
  description:
    "Execute a ready TimelockController operation. Takes the same action block, predecessor and salt used in governor:timelock-schedule.",
  createsBatchContext: true,
  args: [
    {
      name: "timelock",
      type: "address",
      description: "TimelockController address",
    },
    {
      name: "actions",
      type: "block",
      description: "Block of commands making up the operation",
    },
  ],
  opts: [
    {
      name: "predecessor",
      type: "bytes32",
      description: "Operation id that must execute first (default none)",
    },
    {
      name: "salt",
      type: "bytes32",
      description: "Salt used when scheduling (default zero)",
    },
  ],
  async run(_module, { timelock, actions }, { opts, interpreters }) {
    const { targets, values, calldatas, totalValue } =
      await collectBlockActions("timelock-execute", actions, interpreters);

    const action = encodeAction(
      timelock,
      "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)",
      [
        targets,
        values,
        calldatas,
        opts.predecessor ?? ZERO_BYTES32,
        opts.salt ?? ZERO_BYTES32,
      ],
      // executeBatch is payable: forward the ETH the actions spend
      totalValue > 0n ? { value: totalValue } : undefined,
    );
    return [action];
  },
});
