import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("set-addr", {
  describeName: "Ens > commands > set-addr <name> <address>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script:
        "ens:set-addr mydao.eth 0x1234567890abcdef1234567890abcdef12345678",
      error: "is not available on",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:set-addr mydao.eth",
      error: "invalid number of arguments",
    },
    {
      name: "should fail with too many arguments",
      script:
        "ens:set-addr mydao.eth 0x1234567890abcdef1234567890abcdef12345678 60 extra",
      error: "invalid number of arguments",
    },
  ],
});
