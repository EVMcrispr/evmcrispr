import type { Action, Param } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, type Num } from "@evmcrispr/sdk";
import type Assertions from "..";
import { encodeAssertion, operatorFragment } from "../lib/assertions";

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
    const isApprox = fragment === "ApproxEq";

    let delta: Num | undefined;
    if (isApprox) {
      if (opts.delta === undefined) {
        throw new ErrorException("the ~= operator requires a --delta value");
      }
      delta = opts.delta;
    }

    const sigParams = ["address", "uint256"];
    if (isApprox) sigParams.push("uint256");
    sigParams.push("string");
    const signature = `assert${fragment}Balance(${sigParams.join(",")})`;

    const params: Param[] = [account, expected];
    if (isApprox && delta) params.push(delta);
    params.push(message ?? "");

    return [await encodeAssertion(module, signature, params)];
  },
});
