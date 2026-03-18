import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils";

describeCommand("fork", {
  describeName: "Sim > commands > fork (...) [--using <backend>]",
  module: "sim",
  preamble: "load sim",
  docCases: [
    {
      description: "Fork and set account balance",
      code: `sim:fork --using anvil (\n  sim:set-balance @me 100e18\n)`,
    },
  ],
  errorCases: [
    {
      name: "should fail with an invalid --auth-token format",
      script: `sim:fork --auth-token badformat (
  print "inside"
)`,
      error: "Invalid --auth-token option",
    },
    {
      name: "should fail with an unknown --using backend",
      script: `sim:fork --using unknown-backend (
  print "inside"
)`,
      error:
        "--using must be one of anvil, hardhat, tenderly, ethereumjs, got unknown-backend",
    },
  ],
});
