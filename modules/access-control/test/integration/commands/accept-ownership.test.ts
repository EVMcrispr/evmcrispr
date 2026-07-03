import "../../setup";
import { encodeAction } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO } from "../../fixtures";

describeCommand("accept-ownership", {
  describeName: "AccessControl > commands > accept-ownership <contract>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode an acceptOwnership action",
      script: `access-control:accept-ownership ${GNO}`,
      expectedActions: [encodeAction(GNO, "acceptOwnership()", [])],
    },
  ],
  errorCases: [
    {
      name: "should fail with too many arguments",
      script: `access-control:accept-ownership ${GNO} ${GNO}`,
      error: "invalid number of arguments",
    },
  ],
});
