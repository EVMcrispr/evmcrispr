import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("wrap", {
  describeName: "Ens > commands > wrap <name>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script: "ens:wrap mydao.eth",
      error: "not available on chain",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:wrap",
      error: "invalid number of arguments",
    },
  ],
});
