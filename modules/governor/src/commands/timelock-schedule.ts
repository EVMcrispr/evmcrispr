import { BindingsSpace, defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Governor from "..";
import { collectBlockActions, hashOperationBatchLocal } from "../utils";

const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;

export default defineCommand<Governor>({
  name: "timelock-schedule",
  description:
    "Schedule a batch of actions on a TimelockController. Optionally binds the operation id to a variable for later state checks or cancellation.",
  createsBatchContext: true,
  args: [
    {
      name: "variable",
      type: "variable",
      optional: true,
      description: "Variable to bind the operation id to",
    },
    {
      name: "timelock",
      type: "address",
      description: "TimelockController address",
    },
    {
      name: "delay",
      type: "number",
      description:
        "Delay, in time units (e.g. 2d; at least the timelock minimum delay)",
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
      description: "Salt to disambiguate identical operations (default zero)",
    },
  ],
  async run(
    module,
    { variable, timelock, delay, actions },
    { opts, interpreters },
  ) {
    const { targets, values, calldatas } = await collectBlockActions(
      "timelock-schedule",
      actions,
      interpreters,
    );
    const predecessor = opts.predecessor ?? ZERO_BYTES32;
    const salt = opts.salt ?? ZERO_BYTES32;

    if (variable) {
      const operationId = hashOperationBatchLocal(
        targets,
        values.map((v) => v.toBigInt()),
        calldatas,
        predecessor,
        salt,
      );
      module.bindingsManager.setBinding(
        variable,
        operationId,
        BindingsSpace.USER,
        true,
        undefined,
        true,
      );
    }

    return [
      encodeAction(
        timelock,
        "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
        [targets, values, calldatas, predecessor, salt, delay],
      ),
    ];
  },
});
