import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens.avatar",
  {
    describeName: "Ens > helpers > @ens.avatar(name)",
    module: "ens",
    cases: [
      {
        name: "should return an avatar URI for a name that has one",
        input: `@ens.avatar("vitalik.eth")`,
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result.length).to.be.greaterThan(0);
        },
      },
    ],
    docCases: [
      {
        description: "Get the avatar for an ENS name",
        code: `set $avatar @ens.avatar("vitalik.eth")\nprint $avatar`,
      },
    ],
    errorCases: [
      {
        name: "should fail when no avatar is set",
        input: `@ens.avatar("noavatar-test-42.eth")`,
        error: "no avatar found",
      },
    ],
    sampleArgs: ['"vitalik.eth"'],
  },
  helpers["ens.avatar"].argDefs,
);
