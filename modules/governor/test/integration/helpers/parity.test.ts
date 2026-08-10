import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @governor, against constant-returning mocks.
 *
 * No governor or timelock on either fork answers these, so the alternative is
 * no coverage. As with @safe, what this proves is narrow and worth stating:
 * each helper issues the same call on both faces and decodes the bytes the
 * same way. It proves nothing about a governor's behaviour, since the mock
 * has none.
 *
 * The @proposalState case is the interesting one — it is the module's
 * documented divergence, where the plain face returns the state's NAME and
 * the `!` face the raw uint8. Pinned so that `@proposalState(...) == "Active"`
 * and `@proposalState!(...) == 4` cannot quietly become interchangeable, or
 * quietly stop being equivalent.
 */

/** getMinDelay() -> uint256 */
const TIMELOCK = "0x0000000000000000000000000000000000060a01";
/** state(uint256) -> uint8; 4 is Succeeded in OZ's ProposalState. */
const GOV = "0x0000000000000000000000000000000000060a02";

describeParity("@governor", {
  module: "governor",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      TIMELOCK,
      encodeAbiParameters([{ type: "uint256" }], [172800n]),
    );
    await installConstantMock(
      client,
      GOV,
      encodeAbiParameters([{ type: "uint8" }], [4]),
    );
  },
  cases: [
    {
      name: "timelockMinDelay reads getMinDelay on both faces",
      run: `@governor:timelockMinDelay(${TIMELOCK})`,
      compile: `@governor:timelockMinDelay!(${TIMELOCK})`,
    },
    {
      name: "diverges: proposalState is a name off-chain and a number on-chain",
      run: `@governor:proposalState(${GOV} 1)`,
      compile: `@governor:proposalState!(${GOV} 1)`,
      helper: "proposalState",
      diverges: {
        reason: "the plain face returns the enum's name, the ! face its uint8",
      },
    },
  ],
});
