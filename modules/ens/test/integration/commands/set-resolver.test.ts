import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("set-resolver", {
  describeName: "Ens > commands > set-resolver <name> <resolver>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script:
        "ens:set-resolver mydao.eth 0x1234567890abcdef1234567890abcdef12345678",
      error: "not available on chain",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:set-resolver mydao.eth",
      error: "invalid number of arguments",
    },
  ],
});
