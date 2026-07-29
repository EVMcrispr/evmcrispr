import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { GNO, GNO_OWNER } from "../../fixtures";

describeHelper(
  "@acl:owner",
  {
    describeName: "AccessControl > helpers > @acl:owner(contract)",
    module: "acl",
    cases: [
      {
        name: "should return the owner of an Ownable contract",
        input: `@acl:owner(${GNO})`,
        expected: GNO_OWNER,
      },
    ],
  },
  helpers.owner.argDefs,
);
