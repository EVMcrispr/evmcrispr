import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("create-subname", {
  describeName: "Ens > commands > create-subname <parent> <label> <owner>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script:
        "ens:create-subname mydao.eth vault 0x1234567890abcdef1234567890abcdef12345678",
      error: "not available on chain",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:create-subname mydao.eth vault",
      error: "invalid number of arguments",
    },
  ],
});
