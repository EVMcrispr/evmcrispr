import "../../setup";
import { encodeAction } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO } from "../../fixtures";

describeCommand("renounce-ownership", {
  describeName: "AccessControl > commands > renounce-ownership <contract>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should encode a renounceOwnership action",
      script: `acl:renounce-ownership ${GNO}`,
      expectedActions: [encodeAction(GNO, "renounceOwnership()", [])],
    },
  ],
});
