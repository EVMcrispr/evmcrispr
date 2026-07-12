import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const ADDR = "0x0000000000000000000000000000000000000001";
const ID = `0x${"00".repeat(31)}01`;

// The pinned Gnosis fork has no AccessManager or
// AccessControlDefaultAdminRules instance, so these read helpers only get
// the auto-generated arg-length checks (same policy as @access-control:canCall).
const HELPERS: Record<string, string[] | undefined> = {
  operationId: [ADDR, ADDR, ADDR, "'transfer(address,uint256)'", "[1]"],
  operationSchedule: undefined,
  defaultAdmin: undefined,
  pendingDefaultAdmin: undefined,
  defaultAdminDelay: undefined,
};

for (const [name, sampleArgs] of Object.entries(HELPERS)) {
  describeHelper(
    `@access-control:${name}`,
    {
      describeName: `AccessControl > helpers > @access-control:${name}`,
      module: "access-control",
      sampleArgs: sampleArgs?.map((s) => s.replace("__ID__", ID)),
    },
    helpers[name].argDefs,
  );
}
