import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { getAddress } from "viem";
import type Lending from "..";
import {
  requireCompile,
  requireRead,
  resolveAdapter,
} from "../adapters/registry";
import type { RateSide } from "../adapters/types";
import { rateAsNum } from "../utils/rates";

/** The side argument, validated the same way for both faces. */
function rateSide(side: unknown): RateSide {
  if (side !== "supply" && side !== "borrow") {
    throw new ErrorException(
      `<side> must be \`supply\` or \`borrow\`, got ${side}`,
    );
  }
  return side;
}

export default defineHelper<Lending>({
  name: "apy",
  batchable: false,
  description:
    "Current APY of a lending-market reserve as a decimal fraction (2.04% is 0.0204), compounded the way the protocol accrues. Pass `supply` for the deposit rate or `borrow` for the variable borrow rate.",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "address",
      description: "Reserve token to inspect (use @token(SYM))",
    },
    {
      name: "side",
      type: "string",
      description:
        "`supply` for the deposit rate, `borrow` for the borrow rate",
    },
    {
      name: "adapter",
      type: "lending-adapter",
      optional: true,
      description:
        "Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain)",
    },
  ],
  async run(module, { token, side, adapter }) {
    const resolved = await resolveAdapter(module, adapter);
    const chainId = await module.getChainId();
    const read = requireRead(resolved, "apy");
    return rateAsNum(await read(module, chainId, token, rateSide(side)));
  },
  compile: async (ctx, node): Promise<Operand> => {
    const module = ctx.module as Lending;
    const interpret = async (i: number): Promise<string | undefined> =>
      node.args[i] === undefined
        ? undefined
        : String(await ctx.interpreters.interpretNode(node.args[i]));

    const token = getAddress(String(await interpret(0)));
    const side = rateSide(await interpret(1));
    // Which market answers is a composition-time decision: the adapter
    // address book, the sim-mode filter and the reserve listing are all
    // off-chain facts. Only the rate itself defers.
    const resolved = await resolveAdapter(module, await interpret(2));
    const chainId = await module.getChainId();
    const compile = requireCompile(resolved, "apy");
    return compile(ctx, module, chainId, token, side);
  },
});
