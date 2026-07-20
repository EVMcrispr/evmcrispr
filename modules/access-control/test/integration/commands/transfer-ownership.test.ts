import "../../setup";
import { encodeAction } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { GNO, SOME_ADDRESS } from "../../fixtures";

describeCommand("transfer-ownership", {
  describeName:
    "AccessControl > commands > transfer-ownership of <contract> to <newOwner>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode a transferOwnership action",
      script: `access-control:transfer-ownership of ${GNO} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(GNO, "transferOwnership(address)", [SOME_ADDRESS]),
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail with too few arguments",
      script: `access-control:transfer-ownership of ${GNO}`,
      error: "invalid number of arguments",
    },
    {
      name: "should fail with an invalid address",
      script: `access-control:transfer-ownership of ${GNO} to not-an-address`,
      error: "must be a valid address",
    },
  ],
});
