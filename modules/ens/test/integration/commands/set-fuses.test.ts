import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("set-fuses", {
  describeName: "Ens > commands > set-fuses <name> <fuse...>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script: "ens:set-fuses mydao.eth cannot-unwrap",
      error: "is not available on",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:set-fuses",
      error: "invalid number of arguments",
    },
    {
      name: "should fail on unknown fuse names",
      script: "ens:set-fuses mydao.eth cannot-fly",
      error: "unknown fuse",
    },
  ],
});
