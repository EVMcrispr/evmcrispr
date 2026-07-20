import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { PROJECT_RECIPIENT } from "../../fixtures";

describeHelper("@giveth:project", {
  module: "giveth",
  cases: [
    {
      name: "resolves a project slug to its recipient address on the chain",
      input: "@giveth:project(evmcrispr)",
      validate: (result) => {
        expect(result).to.eq(PROJECT_RECIPIENT);
      },
    },
  ],
  errorCases: [
    {
      name: "fails for unknown slugs",
      input: "@giveth:project(nonexistent-project-slug-xyz)",
      error: "Project not found",
    },
  ],
  docCases: [
    {
      description: "Print the recipient address of a Giveth project",
      code: 'print "evmcrispr project address:" @giveth:project(evmcrispr)',
    },
  ],
});

describeHelper("@giveth:project", {
  describeName: "Giveth > helpers > @giveth:project > other chains",
  module: "giveth",
  preamble: "switch optimism",
  skipArgLengthCheck: true,
  cases: [],
  errorCases: [
    {
      name: "fails when the project has no recipient address on the chain",
      input: "@giveth:project(gnosis-only-project)",
      error: "Project doesn't have an address on this chain",
    },
  ],
});
