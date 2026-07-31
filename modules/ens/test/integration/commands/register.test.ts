import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("register", {
  describeName: "Ens > commands > register <name> <owner> <duration>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script:
        'ens:register mydao 0x1234567890abcdef1234567890abcdef12345678 31536000 --secret @hash("my secret")',
      error: "is not available on",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:register mydao",
      error: "invalid number of arguments",
    },
    {
      name: "should fail on invalid --step values",
      script:
        'ens:register mydao 0x1234567890abcdef1234567890abcdef12345678 31536000 --secret @hash("my secret") --step only-dance',
      error: "invalid --step",
    },
    {
      name: "should not be batchable with the default commit-wait-reveal flow",
      script:
        'batch (\n  ens:register mydao 0x1234567890abcdef1234567890abcdef12345678 31536000 --secret @hash("my secret")\n)',
      error: "includes a wait step and cannot be batched",
    },
    {
      name: "should not be batchable with --step only-commit-and-wait",
      script:
        'batch (\n  ens:register mydao 0x1234567890abcdef1234567890abcdef12345678 31536000 --secret @hash("my secret") --step only-commit-and-wait\n)',
      error: "includes a wait step and cannot be batched",
    },
    {
      // Passing the batchable gate means the command proceeds to run() and
      // fails on the unsupported test chain instead of the batch error.
      name: "should pass the batchable gate with --step only-commit",
      script:
        'batch (\n  ens:register mydao 0x1234567890abcdef1234567890abcdef12345678 31536000 --secret @hash("my secret") --step only-commit\n)',
      error: "is not available on",
    },
  ],
});
