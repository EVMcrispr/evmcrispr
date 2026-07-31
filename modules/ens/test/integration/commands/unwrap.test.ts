import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("unwrap", {
  describeName: "Ens > commands > unwrap <name>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script: "ens:unwrap mydao.eth",
      error: "is not available on",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:unwrap",
      error: "invalid number of arguments",
    },
  ],
});
