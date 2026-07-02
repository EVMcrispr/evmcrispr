import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("transfer", {
  describeName: "Ens > commands > transfer <name> <newOwner>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script:
        "ens:transfer mydao.eth 0x1234567890abcdef1234567890abcdef12345678",
      error: "not available on chain",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:transfer mydao.eth",
      error: "invalid number of arguments",
    },
  ],
});
