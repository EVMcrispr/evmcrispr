import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { L1_ID, L2_ID } from "../../devnet";

/**
 * A module's chains are addressable by key from std's `switch` without
 * loading the module: registration happens at `evml.use` time.
 */
describeCommand("switch", {
  describeName: "Eez > chains > switch by key",
  cases: [
    {
      name: "switches to eezL1 by key",
      script: "switch eezL1",
      validate: (actions, interpreter) => {
        expect(actions).to.have.lengthOf(1);
        expect((actions[0] as any).params[0].chainId).to.equal(
          `0x${L1_ID.toString(16)}`,
        );
        return interpreter.evm.getChainId().then((id) => {
          expect(id).to.equal(L1_ID);
        });
      },
    },
    {
      name: "switches to eezL2 by key",
      script: "switch eezL2",
      validate: async (_actions, interpreter) => {
        expect(await interpreter.evm.getChainId()).to.equal(L2_ID);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects an unknown key",
      script: "switch eezL3",
      error: "must be a chain id or a camelCase chain name",
    },
  ],
});
