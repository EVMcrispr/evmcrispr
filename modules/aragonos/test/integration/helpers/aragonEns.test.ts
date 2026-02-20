import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@aragonEns",
  {
    module: "aragonos",
    describeName: "AragonOS > helpers > @aragonEns()",
    cases: [
      {
        name: "should resolve a repo ENS name to an address",
        input:
          "@aragonEns(hooked-token-manager-no-controller.open.aragonpm.eth)",
        expected: "0x7762A148DeA89C5099c0B14c260a2e24bB3AD264",
      },
      {
        name: "should resolve a DAO ENS name to an address",
        input: "@aragonEns(test.aragonid.eth)",
        expected: "0x380498cF5C188BAD479EFbc0Ea1eC40d49D5C58d",
      },
    ],
    errorCases: [
      {
        name: "should fail when ENS name cannot be resolved",
        input:
          "@aragonEns(nonexistent-name-that-should-not-resolve.aragonid.eth)",
        error: "couldn't be resolved",
      },
    ],
    sampleArgs: [
      "mydao.aragonid.eth",
      "0x98Df287B6C145399Aaa709692c8D308357bC085D",
    ],
  },
  helpers.aragonEns.argDefs,
);
