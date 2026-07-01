import type { Action, Param } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import { encodeAssertion } from "../lib/assertions";

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
    const params: Param[] = [expected, message ?? ""];
    return [
      await encodeAssertion(module, "assertEqChainId(uint256,string)", params),
    ];
  },
});
