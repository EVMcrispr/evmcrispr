import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

// The pinned Gnosis fork has no TimelockController instance, so these read
// helpers only get the auto-generated arg-length checks.
const HELPERS: Record<string, string[] | undefined> = {
  "governor.timelockMinDelay": undefined,
  "governor.timelockOperationState": undefined,
};

for (const [name, sampleArgs] of Object.entries(HELPERS)) {
  describeHelper(
    `@${name}`,
    {
      describeName: `Governor > helpers > @${name}`,
      module: "governor",
      sampleArgs,
    },
    helpers[name].argDefs,
  );
}
