import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddress } from "viem";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens.addr",
  {
    describeName: "Ens > helpers > @ens.addr(name, [coinType])",
    module: "ens",
    cases: [
      {
        name: "resolve a name to its address",
        input: '@ens.addr("vitalik.eth")',
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
      {
        name: "resolve with an explicit coin type",
        input: '@ens.addr("vitalik.eth" 60)',
        validate: (result) => {
          expect(isAddress(result)).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Resolve a name to an address",
        code: `set $addr @ens.addr("vitalik.eth")\nprint $addr`,
      },
    ],
    errorCases: [
      {
        name: "fails for unresolvable names",
        input: '@ens.addr("this-name-definitely-does-not-exist-xyz123.eth")',
        error: "no address found",
      },
    ],
    sampleArgs: ['"vitalik.eth"', "60"],
  },
  helpers["ens.addr"].argDefs,
);
