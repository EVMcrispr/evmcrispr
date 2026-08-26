import "../../setup";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

const OTHER_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describeCommand("fork", {
  describeName: "Sim > commands > fork (...) [--using <backend>]",
  module: "sim",
  preamble: "load sim",
  cases: [
    {
      name: "restores the script's account after a --from fork",
      script: `sim:fork --using anvil --from ${OTHER_ACCOUNT} (
  set $inside @me
)
set $after @me`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inside", BindingsSpace.USER)).to.eq(
          OTHER_ACCOUNT,
        );
        expect(interpreter.getBinding("$after", BindingsSpace.USER)).to.eq(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
  ],
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
        "--using must be one of anvil, hardhat, tenderly, tenderly-multichain, ethereumjs, revm, got unknown-backend",
    },
  ],
});
