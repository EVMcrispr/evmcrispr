import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { SOME_ADDRESS } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function disconnectPool(address pool, bytes userData) returns (bool)",
]);

describeCommand("disconnect-pool", {
  describeName: "Superfluid > commands > disconnect-pool <pool>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "builds a disconnectPool action",
      script: `superfluid:disconnect-pool ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const { functionName } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("disconnectPool");
      },
    },
    {
      name: "connects and disconnects on a fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:create-pool $pool xDAIx
  superfluid:connect-pool $pool
  superfluid:disconnect-pool $pool
  sim:expect @bool(@superfluid:connected($pool @me) == false)
)`,
      validate: () => {
        // Reaching this point means the full connect/disconnect round-trip
        // executed on the fork.
      },
    },
  ],
  docCases: [
    {
      description:
        "Disconnect from a pool (earnings keep accruing, claim later)",
      code: `superfluid:create-pool $rewards xDAIx
superfluid:connect-pool $rewards
superfluid:disconnect-pool $rewards`,
    },
  ],
});
