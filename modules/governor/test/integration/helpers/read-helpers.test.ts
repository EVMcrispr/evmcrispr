import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

// The pinned Gnosis fork has no TimelockController instance, so these read
// helpers only get the auto-generated arg-length checks.
const HELPERS: Record<string, string[] | undefined> = {
  timelockMinDelay: undefined,
  timelockOperationState: undefined,
};

for (const [name, sampleArgs] of Object.entries(HELPERS)) {
  describeHelper(
    `@governor:${name}`,
    {
      describeName: `Governor > helpers > @governor:${name}`,
      module: "governor",
      sampleArgs,
    },
    helpers[name].argDefs,
  );
}
