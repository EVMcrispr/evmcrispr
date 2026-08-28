import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData } from "viem";
import { automateAbi } from "../../../src/abis";
import { AUTOMATE } from "../../fixtures";

const TASK_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

describeCommand("cancel", {
  module: "gelato",
  preamble: "load gelato",
  cases: [
    {
      name: "builds a cancelTask action",
      script: `gelato:cancel ${TASK_ID}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          AUTOMATE.toLowerCase(),
        );
        const { functionName, args } = decodeFunctionData({
          abi: automateAbi,
          data: action.data,
        });
        expect(functionName).to.eq("cancelTask");
        expect(args?.[0]).to.eq(TASK_ID);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a short task id",
      script: "gelato:cancel 0x1234",
      error: "bytes32",
    },
  ],
  docCases: [
    {
      description: "Create a task and cancel it again, in a fork",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:automate --every 1h (
    exec 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance()
  )
  gelato:cancel @gelato:lastTask()
)`,
      preamble: "load gelato",
    },
  ],
});
