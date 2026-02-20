import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils";

describeCommand("renew", {
  describeName: "Ens > commands > renew <domains> <duration>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail when not on mainnet (single domain)",
      script: 'ens:renew ["example.eth"] 31536000',
      error: "This command only works on mainnet",
    },
    {
      name: "should fail when not on mainnet (multiple domains)",
      script: 'ens:renew ["name1.eth","name2.eth"] 31536000',
      error: "This command only works on mainnet",
    },
    {
      name: "should fail with too few arguments (no args)",
      script: "ens:renew",
      error: "invalid number of arguments",
    },
    {
      name: "should fail with too few arguments (one arg)",
      script: 'ens:renew ["example.eth"]',
      error: "invalid number of arguments",
    },
    {
      name: "should fail with too many arguments",
      script: 'ens:renew ["example.eth"] 31536000 extra',
      error: "invalid number of arguments",
    },
  ],
});
