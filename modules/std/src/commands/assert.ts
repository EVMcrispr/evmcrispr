import type { Action, Node } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, type Num } from "@evmcrispr/sdk";
import {
  ASSERT_WRAP_HINT,
  assertionAction,
  compileAssertion,
  defaultCompileCtx,
} from "@evmcrispr/sdk/onchain";
import type Std from "..";

export default defineCommand<Std>({
  name: "assert",
  description:
    "Assert that an on-chain expression satisfies a comparison, on-chain.",
  args: [
    {
      name: "call",
      type: "expression",
      description:
        "A `::` call expression or on-chain helper, e.g. `@token(WETH)::balanceOf(@me)` or `@calc!(@balance!(ETH @me) + 1e18)`",
    },
    {
      name: "operator",
      type: "string",
      optional: true,
      description: "Comparison operator: ==, !=, >, <, >=, <=, ~=",
    },
    {
      name: "expected",
      type: "expression",
      optional: true,
      description:
        "Expected value — a constant, or another live call/on-chain helper",
    },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
    {
      name: "extra",
      type: "any",
      rest: true,
      optional: true,
      description:
        "(invalid) trailing tokens — infix expressions must be wrapped in @calc!/@bool!",
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
    { call, operator, expected, message, extra },
    { opts, interpreters },
  ): Promise<Action[]> {
    if (Array.isArray(extra) && extra.length > 0) {
      throw new ErrorException(ASSERT_WRAP_HINT);
    }
    // The compiler is the single authority on what the line means; the
    // command only parses the surface and wraps the result as an action.
    const ctx = defaultCompileCtx(module, interpreters);
    const compiled = await compileAssertion(ctx, {
      call: call as Node,
      operator: operator as string | undefined,
      expected: expected as Node | undefined,
      message: message as string | undefined,
      delta: opts.delta as Num | undefined,
    });
    return [assertionAction(compiled)];
  },
});
