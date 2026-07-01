import type { Action, Param } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import { encodeAssertion, operatorFragment } from "../lib/assertions";

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
    const signature = `assert${fragment}BlockTimestamp(uint256,string)`;
    const params: Param[] = [expected, message ?? ""];
    return [await encodeAssertion(module, signature, params)];
  },
});
