import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { TOKEN_VOTING_REPO } from "../../fixtures";

describeHelper("@aragonosx:repo", {
  module: "aragonosx",
  preamble: `set $aragonosx:pluginSetupProcessor 0x00000000000000000000000000000000000000a1`,
  cases: [
    {
      name: "passes repo addresses through",
      input: `@aragonosx:repo(${TOKEN_VOTING_REPO})`,
      expected: TOKEN_VOTING_REPO,
    },
  ],
  errorCases: [
    {
      name: "fails on an unresolvable subdomain",
      input: '@aragonosx:repo("not-a-repo")',
      error: "couldn't be resolved",
    },
  ],
});
