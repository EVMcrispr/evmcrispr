import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { GNO, GNO_OWNER } from "../../fixtures";

describeHelper(
  "@access-control.owner",
  {
    describeName: "AccessControl > helpers > @access-control.owner(contract)",
    module: "access-control",
    cases: [
      {
        name: "should return the owner of an Ownable contract",
        input: `@access-control.owner(${GNO})`,
        expected: GNO_OWNER,
      },
    ],
  },
  helpers["access-control.owner"].argDefs,
);
