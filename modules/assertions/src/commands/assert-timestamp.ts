import type { Action, Num } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import {
  assertParamAction,
  boundWord,
  operatorFragment,
  resolveAssertionsContract,
  resolveOperatorsContract,
} from "../lib/assertions";
import { staticCallParam } from "../lib/erc8211";
import { wordJudge } from "../lib/judge";
import { encodeOperator } from "../lib/operators";

const ALLOWED = ["Eq", "Gt", "Lt", "Ge", "Le"];

export default defineCommand<Assertions>({
  name: "assert-timestamp",
  description: "Assert the current block timestamp, on-chain.",
  args: [
    {
      name: "operator",
      type: "string",
      description: "Comparison operator: ==, >, <, >=, <=",
    },
    {
      name: "expected",
      type: "number",
      description: "Expected block timestamp (unix seconds)",
    },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
  ],
  async run(module, { operator, expected, message }): Promise<Action[]> {
    const fragment = operatorFragment(operator, ALLOWED);
    const addrs = {
      core: await resolveAssertionsContract(module),
      operators: await resolveOperatorsContract(module),
    };
    const live = staticCallParam(addrs.operators, encodeOperator("timestamp"));
    const param = wordJudge(
      addrs,
      live,
      fragment,
      boundWord(expected as Num, fragment),
    );
    return [await assertParamAction(module, param, message ?? "")];
  },
});
