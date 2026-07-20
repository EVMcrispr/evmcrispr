import "../../setup";
import { encodeAction } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO } from "../../fixtures";

describeCommand("accept-ownership", {
  describeName: "AccessControl > commands > accept-ownership <contract>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should encode an acceptOwnership action",
      script: `acl:accept-ownership ${GNO}`,
      expectedActions: [encodeAction(GNO, "acceptOwnership()", [])],
    },
  ],
  errorCases: [
    {
      name: "should fail with too many arguments",
      script: `acl:accept-ownership ${GNO} ${GNO}`,
      error: "invalid number of arguments",
    },
  ],
});
