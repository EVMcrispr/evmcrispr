import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("set-primary-name", {
  describeName: "Ens > commands > set-primary-name <name>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script: "ens:set-primary-name mydao.eth",
      error: "not available on chain",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:set-primary-name",
      error: "invalid number of arguments",
    },
    {
      name: "should fail with too many arguments",
      script: "ens:set-primary-name mydao.eth extra",
      error: "invalid number of arguments",
    },
  ],
});
