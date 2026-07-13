import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { GDA_FORWARDER, RECEIVER, SOME_ADDRESS, XDAIX } from "../../fixtures";

const forwarderAbi = parseAbi([
  "struct PoolConfig { bool transferabilityForUnitsOwner; bool distributionFromAnyAddress; }",
  "function createPool(address token, address admin, PoolConfig config) returns (bool, address)",
]);

describeCommand("create-pool", {
  describeName: "Superfluid > commands > create-pool <variable> <token>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "builds a createPool action with the connected account as admin",
      script: `superfluid:create-pool $pool ${XDAIX}`,
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
        expect(functionName).to.eq("createPool");
        expect((args?.[0] as string).toLowerCase()).to.eq(XDAIX.toLowerCase());
        expect((args?.[1] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect(args?.[2]).to.deep.eq({
          transferabilityForUnitsOwner: false,
          distributionFromAnyAddress: false,
        });
      },
    },
    {
      name: "honors --admin and the pool config flags",
      script: `superfluid:create-pool $pool ${XDAIX} --admin ${SOME_ADDRESS} --transferable-units true --open-distribution true`,
      validate: (actions) => {
        const { args } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect((args?.[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect(args?.[2]).to.deep.eq({
          transferabilityForUnitsOwner: true,
          distributionFromAnyAddress: true,
        });
      },
    },
    {
      name: "runs a full pool lifecycle on a fork, proving the predicted address",
      script: `load sim
set $alice ${RECEIVER}
set $bob ${SOME_ADDRESS}
sim:fork --using anvil (
  sim:set-balance @me 20000e18
  superfluid:wrap 10000e18 into xDAIx
  superfluid:create-pool $rewards xDAIx
  superfluid:set-units 3 to $alice in $rewards
  superfluid:set-units 1 to $bob in $rewards
  sim:expect @bool(@superfluid:units($rewards $alice) == 3)
  sim:expect @bool(@superfluid:totalUnits($rewards) == 4)
  superfluid:distribute 400e18 xDAIx to $rewards
  sim:expect @bool(@superfluid:claimable($rewards $alice) == 300e18)
  superfluid:claim from $rewards --for $alice
  sim:expect @bool(@superfluid:claimable($rewards $alice) == 0)
  superfluid:distribute-flow 1000e18/mo xDAIx to $rewards
  sim:expect @bool(@superfluid:distributionFlowrate(xDAIx @me $rewards) > 0)
  sim:expect @bool(@superfluid:memberFlowrate($rewards $alice) > 0)
  superfluid:distribute-flow 0 xDAIx to $rewards
  sim:expect @bool(@superfluid:distributionFlowrate(xDAIx @me $rewards) == 0)
)`,
      validate: () => {
        // Every pool call ran against the address predicted at plan time —
        // a wrong prediction would revert set-units or return zero units.
      },
    },
  ],
  errorCases: [
    {
      name: "should require a variable to bind the pool address to",
      script: `superfluid:create-pool ${XDAIX}`,
      error: "invalid number of arguments",
    },
  ],
  docCases: [
    {
      description:
        "Create a rewards pool, weight two members 3:1 and distribute 400 xDAIx (alice receives 300, bob 100)",
      code: `set $alice 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
set $bob 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

superfluid:create-pool $rewards xDAIx
superfluid:set-units 3 to $alice in $rewards
superfluid:set-units 1 to $bob in $rewards
superfluid:distribute 400e18 xDAIx to $rewards`,
    },
  ],
});
