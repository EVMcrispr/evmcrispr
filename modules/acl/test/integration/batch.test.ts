import "../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO, SOME_ADDRESS } from "../fixtures";

// acl read helpers are marked batchable: false — inside an atomic batch they
// evaluate at build time and can't observe earlier actions' effects.
describeCommand("batch", {
  describeName: "AccessControl > batch restrictions",
  module: "acl",
  preamble: "load acl",
  errorCases: [
    {
      name: "should reject acl read helpers after actions in a batch",
      script: `batch (
  acl:transfer-ownership of ${GNO} to ${SOME_ADDRESS}
  set $owner @acl:owner(${GNO})
)`,
      error: "reads on-chain state at batch-build time",
    },
  ],
});
