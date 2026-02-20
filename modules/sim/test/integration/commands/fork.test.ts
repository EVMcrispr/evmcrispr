import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils";

describeCommand("fork", {
  describeName: "Sim > commands > fork (...) [--using <backend>]",
  module: "sim",
  preamble: "load sim",
  errorCases: [
    {
      name: "should fail when neither --using nor --tenderly is specified",
      script: `sim:fork (
  print "inside"
)`,
      error: "Must specify --using anvil, --using hardhat, or --tenderly",
    },
    {
      name: "should fail with an invalid --tenderly format",
      script: `sim:fork --tenderly badformat (
  print "inside"
)`,
      error: "Invalid --tenderly option",
    },
    {
      name: "should fail with an unknown --using backend",
      script: `sim:fork --using unknown-backend (
  print "inside"
)`,
      error: "--using must be one of anvil, hardhat, tenderly, got unknown-backend",
    },
  ],
});
