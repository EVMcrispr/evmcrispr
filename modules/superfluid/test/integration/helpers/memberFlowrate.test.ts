import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@superfluid:memberFlowrate", {
  module: "superfluid",
  docCases: [
    {
      description:
        "The slice of a streaming distribution a member currently receives",
      code: `load sim

sim:fork --using anvil (
  sim:set-balance @me 20000e18
  superfluid:wrap 10000e18 into xDAIx
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  superfluid:distribute-flow 1000e18/mo xDAIx to $pool
  sim:expect @bool(@superfluid:memberFlowrate($pool 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) > 0)
)`,
      preamble: "load superfluid",
    },
  ],
});
