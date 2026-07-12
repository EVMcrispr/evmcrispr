import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { DISTRIBUTOR, SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

describeHelper(
  "@access-control:hasRole",
  {
    describeName:
      "AccessControl > helpers > @access-control:hasRole(target, role, account)",
    module: "access-control",
    cases: [
      {
        name: "should return true for an account holding the role",
        input: `@access-control:hasRole(${TOKEN_DISTRO} DISTRIBUTOR_ROLE ${DISTRIBUTOR})`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
      {
        name: "should return false for an account without the role",
        input: `@access-control:hasRole(${TOKEN_DISTRO} DISTRIBUTOR_ROLE ${SOME_ADDRESS})`,
        validate: (result) => {
          expect(result).to.equal(false);
        },
      },
      {
        name: "should accept raw bytes32 roles",
        input: `@access-control:hasRole(${TOKEN_DISTRO} 0xfbd454f36a7e1a388bd6fc3ab10d434aa4578f811acbbcf33afb1c697486313c ${DISTRIBUTOR})`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
    ],
    errorCases: [
      {
        name: "should fail for malformed hex roles",
        input: `@access-control:hasRole(${TOKEN_DISTRO} 0xabcd ${DISTRIBUTOR})`,
        error: "hex roles must be 32 bytes",
      },
    ],
  },
  helpers.hasRole.argDefs,
);
