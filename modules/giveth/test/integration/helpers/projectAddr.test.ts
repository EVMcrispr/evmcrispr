import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@projectAddr",
  {
    skip: true,
    module: "giveth",
    describeName: "Giveth > helpers > @projectAddr(slug)",
    cases: [
      {
        name: "return the project address",
        input: "@projectAddr(evmcrispr)",
        expected: "0xeafFF6dB1965886348657E79195EB6f1A84657eB",
      },
    ],
    sampleArgs: ["evmcrispr"],
  },
  helpers.projectAddr.argDefs,
);
