import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { CHECKER } from "../../fixtures";

describeHelper("@gelato:tasks", {
  module: "gelato",
  cases: [
    {
      name: "returns an array for an account without tasks",
      input: `@gelato:tasks(${CHECKER})`,
      validate: (value: unknown) => {
        expect(Array.isArray(value)).to.eq(true);
      },
    },
  ],
  docCases: [
    {
      description:
        "Create two tasks in a fork and see them listed under your account",
      code: `load sim
load lang

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --every 1h
  gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest() --cron "0 0 * * *"
  sim:expect @bool(@lang:len(@gelato:tasks()) == 2)
)`,
      preamble: "load gelato",
    },
  ],
});

describeHelper("@gelato:lastTask", {
  module: "gelato",
  errorCases: [
    {
      name: "fails for an account without tasks",
      input: `@gelato:lastTask(${CHECKER})`,
      error: "no active Gelato tasks",
    },
  ],
  docCases: [
    {
      description: "Cancel the task just created",
      code: `load sim
load lang

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --every 1h
  gelato:cancel @gelato:lastTask()
  sim:expect @bool(@lang:len(@gelato:tasks()) == 0)
)`,
      preamble: "load gelato",
    },
  ],
});
