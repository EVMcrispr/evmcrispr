import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@acl:pendingOwner",
  {
    describeName:
      "AccessControl > helpers > @acl:pendingOwner(contract)",
    module: "acl",
  },
  helpers.pendingOwner.argDefs,
);
