import type { Action, Num } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import { assertParamAction, resolveOperatorsContract } from "../lib/assertions";
import { constraint, staticCallParam } from "../lib/erc8211";
import { encodeOperator } from "../lib/operators";

export default defineCommand<Assertions>({
  name: "assert-chainid",
  description: "Assert the chain ID equals an expected value, on-chain.",
  args: [
    { name: "expected", type: "number", description: "Expected chain ID" },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
  ],
  async run(module, { expected, message }): Promise<Action[]> {
    const operators = await resolveOperatorsContract(module);
    const param = staticCallParam(operators, encodeOperator("chainId"), [
      constraint("Eq", (expected as Num).toBigInt()),
    ]);
    return [await assertParamAction(module, param, message ?? "")];
  },
});
