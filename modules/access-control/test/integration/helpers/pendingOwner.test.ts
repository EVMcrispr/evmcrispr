import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@access-control:pendingOwner",
  {
    describeName:
      "AccessControl > helpers > @access-control:pendingOwner(contract)",
    module: "access-control",
  },
  helpers.pendingOwner.argDefs,
);
