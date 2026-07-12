import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { TOKEN_DISTRO } from "../../fixtures";

describeHelper(
  "@access-control:roleAdmin",
  {
    describeName:
      "AccessControl > helpers > @access-control:roleAdmin(target, role)",
    module: "access-control",
    cases: [
      {
        name: "should return the bytes32 admin role of an AccessControl role",
        input: `@access-control:roleAdmin(${TOKEN_DISTRO} DISTRIBUTOR_ROLE)`,
        expected: `0x${"00".repeat(32)}`,
      },
    ],
  },
  helpers.roleAdmin.argDefs,
);
