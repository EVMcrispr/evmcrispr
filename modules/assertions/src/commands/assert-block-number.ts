import type { Action, Num } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import {
  assertParamAction,
  operatorFragment,
  resolveCombinatorsContract,
} from "../lib/assertions";
import { encodeEnv } from "../lib/combinators";
import { staticCallParam } from "../lib/erc8211";
import { wordJudge } from "../lib/judge";

const ALLOWED = ["Eq", "Gt", "Lt", "Ge", "Le"];

export default defineCommand<Assertions>({
  name: "assert-block-number",
  description: "Assert the current block number, on-chain.",
  args: [
    {
      name: "operator",
      type: "string",
      description: "Comparison operator: ==, >, <, >=, <=",
    },
    {
      name: "expected",
      type: "number",
      description: "Expected block number",
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
    const combinators = await resolveCombinatorsContract(module);
    const live = staticCallParam(combinators, encodeEnv("BlockNumber"));
    const param = wordJudge(
      combinators,
      live,
      fragment,
      (expected as Num).toBigInt(),
    );
    return [await assertParamAction(module, param, message ?? "")];
  },
});
