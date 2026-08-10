import type { Action, Num } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type Assertions from "..";
import {
  assertParamAction,
  boundWord,
  operatorFragment,
  resolveAssertionsContract,
  resolveOperatorsContract,
  wholeDelta,
} from "../lib/assertions";
import { balanceParam } from "../lib/erc8211";
import { wordJudge } from "../lib/judge";

const ALLOWED = ["Eq", "Gt", "Lt", "Ge", "Le", "ApproxEq"];

export default defineCommand<Assertions>({
  name: "assert-balance",
  description: "Assert the native balance of an account, on-chain.",
  args: [
    { name: "account", type: "address", description: "Account to check" },
    {
      name: "operator",
      type: "string",
      description: "Comparison operator: ==, >, <, >=, <=, ~=",
    },
    {
      name: "expected",
      type: "number",
      description: "Expected balance in wei",
    },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
  ],
  opts: [
    {
      name: "delta",
      type: "number",
      description: "Allowed delta for the ~= (approximate) operator",
    },
  ],
  async run(
    module,
    { account, operator, expected, message },
    { opts },
  ): Promise<Action[]> {
    const fragment = operatorFragment(operator, ALLOWED);

    let delta: bigint | undefined;
    if (fragment === "ApproxEq") {
      if (opts.delta === undefined) {
        throw new ErrorException("the ~= operator requires a --delta value");
      }
      delta = wholeDelta(opts.delta as Num);
    }

    // The ERC-8211 BALANCE fetcher: token 0 reads the native balance.
    const live = balanceParam(zeroAddress, account);
    const addrs = {
      core: await resolveAssertionsContract(module),
      operators: await resolveOperatorsContract(module),
    };
    const param = wordJudge(
      addrs,
      live,
      fragment,
      boundWord(expected as Num, fragment),
      { delta },
    );
    return [await assertParamAction(module, param, message ?? "")];
  },
});
