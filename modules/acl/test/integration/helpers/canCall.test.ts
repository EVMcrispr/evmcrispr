import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

const MANAGER = "0x1111111111111111111111111111111111111111";

describeHelper(
  "@acl:canCall",
  {
    describeName:
      "AccessControl > helpers > @acl:canCall(manager, caller, target, signature)",
    module: "acl",
    errorCases: [
      {
        name: "should fail on malformed signatures",
        input: `@acl:canCall(${MANAGER} ${SOME_ADDRESS} ${TOKEN_DISTRO} "not a signature")`,
        error: "invalid function signature",
      },
    ],
  },
  helpers.canCall.argDefs,
);
