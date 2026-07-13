import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { GDA_FORWARDER, SOME_ADDRESS } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function connectPool(address pool, bytes userData) returns (bool)",
]);

describeCommand("connect-pool", {
  describeName: "Superfluid > commands > connect-pool <pool>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "builds a connectPool action",
      script: `superfluid:connect-pool ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          GDA_FORWARDER.toLowerCase(),
        );
        const { functionName, args } = decodeFunctionData({
          abi: forwarderAbi,
          data: action.data,
        });
        expect(functionName).to.eq("connectPool");
        expect((args?.[0] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
      },
    },
    {
      name: "connects a member so pool earnings show in their balance (fork)",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:create-pool $pool xDAIx
  superfluid:connect-pool $pool
  sim:expect @superfluid:connected($pool @me)
)`,
      validate: () => {
        // Reaching this point means connect executed and the membership
        // read back true on the fork.
      },
    },
  ],
  docCases: [
    {
      description:
        "Connect to a pool you were added to, so earnings stream straight into your balance",
      code: `superfluid:create-pool $rewards xDAIx
superfluid:connect-pool $rewards`,
    },
  ],
});
