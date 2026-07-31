import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("set-text", {
  describeName: "Ens > commands > set-text <name> <key> <value>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script: 'ens:set-text mydao.eth url "https://mydao.example"',
      error: "is not available on",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:set-text mydao.eth url",
      error: "invalid number of arguments",
    },
  ],
});
