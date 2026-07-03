import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

const MANAGER = "0x1111111111111111111111111111111111111111";

describeHelper(
  "@access-control.canCall",
  {
    describeName:
      "AccessControl > helpers > @access-control.canCall(manager, caller, target, signature)",
    module: "access-control",
    errorCases: [
      {
        name: "should fail on malformed signatures",
        input: `@access-control.canCall(${MANAGER} ${SOME_ADDRESS} ${TOKEN_DISTRO} "not a signature")`,
        error: "invalid function signature",
      },
    ],
  },
  helpers["access-control.canCall"].argDefs,
);
