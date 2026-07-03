import "../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO, SOME_ADDRESS } from "../fixtures";

// access-control read helpers are marked batchable: false — inside an atomic batch they
// evaluate at build time and can't observe earlier actions' effects.
describeCommand("batch", {
  describeName: "AccessControl > batch restrictions",
  module: "access-control",
  preamble: "load access-control",
  errorCases: [
    {
      name: "should reject access-control read helpers after actions in a batch",
      script: `batch (
  access-control:transfer-ownership ${GNO} ${SOME_ADDRESS}
  set $owner @access-control.owner(${GNO})
)`,
      error: "reads on-chain state at batch-build time",
    },
  ],
});
