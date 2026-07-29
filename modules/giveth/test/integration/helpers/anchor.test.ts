import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";
import { PROJECT_ANCHOR_OPTIMISM } from "../../fixtures";

describeHelper("@giveth:anchor", {
  describeName: "Giveth > helpers > @giveth:anchor (Optimism)",
  module: "giveth",
  preamble: "switch optimism",
  cases: [
    {
      name: "resolves a project slug to its anchor contract on the chain",
      input: "@giveth:anchor(evmcrispr)",
      validate: (result) => {
        expect(result).to.eq(getAddress(PROJECT_ANCHOR_OPTIMISM));
      },
    },
  ],
  docCases: [
    {
      description:
        "Stream a monthly recurring donation to a project's anchor contract",
      code: `load superfluid

switch optimism
superfluid:stream 100e18/mo GIVx to @giveth:anchor(evmcrispr)`,
      preamble: "load giveth",
    },
  ],
});

describeHelper("@giveth:anchor", {
  describeName: "Giveth > helpers > @giveth:anchor > unsupported chains",
  module: "giveth",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails on chains without anchor contracts",
      input: "@giveth:anchor(wayback-machine)",
      error: "recurring donations are only available on Optimism and Base",
    },
  ],
});
