import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { encodeFunctionData } from "viem";
import type Gelato from "..";
import { automateAbi } from "../abis";
import { AUTOMATE_ADDRESS } from "../addresses";
import { requireAutomate } from "../utils/protocol";

export default defineCommand<Gelato>({
  name: "cancel",
  description:
    "Cancel a Gelato Automate task you created. Find task ids with @gelato:tasks or @gelato:lastTask.",
  args: [{ name: "taskId", type: "bytes32", description: "Task id to cancel" }],
  async run(module, { taskId }) {
    await requireAutomate(module);
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(taskId))) {
      throw new ErrorException(
        `<taskId> must be a bytes32 task id, got ${taskId}`,
      );
    }
    return [
      {
        to: AUTOMATE_ADDRESS,
        data: encodeFunctionData({
          abi: automateAbi,
          functionName: "cancelTask",
          args: [taskId as Hex],
        }),
      },
    ];
  },
});
