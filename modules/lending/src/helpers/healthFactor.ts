import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { compileOperand } from "@evmcrispr/sdk/onchain";
import type Lending from "..";
import {
  requireCompile,
  requireRead,
  resolveAdapter,
} from "../adapters/registry";
import { WAD } from "../utils/rates";

export default defineHelper<Lending>({
  name: "healthFactor",
  batchable: false,
  description:
    "Health factor of an account's lending position: below 1 the position is liquidatable, and an account with no debt reads as effectively unbounded. Compare it directly, as in `>= 1.5`.",
  returnType: "number",
  args: [
    { name: "account", type: "address", description: "Account to inspect" },
    {
      name: "adapter",
      type: "lending-adapter",
      optional: true,
      description:
        "Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain)",
    },
  ],
  async run(module, { account, adapter }) {
    const resolved = await resolveAdapter(module, adapter);
    const chainId = await module.getChainId();
    const read = requireRead(resolved, "healthFactor");
    // The protocol keeps this wad-scaled; the exact rational is what the
    // number means, and it is what the on-chain face compares against.
    return Num(await read(module, chainId, account), WAD);
  },
  compile: async (ctx, node): Promise<Operand> => {
    const module = ctx.module as Lending;
    const account = await compileOperand(ctx, node.args[0]);
    const adapter =
      node.args[1] === undefined
        ? undefined
        : String(await ctx.interpreters.interpretNode(node.args[1]));
    const resolved = await resolveAdapter(module, adapter);
    const chainId = await module.getChainId();
    const compile = requireCompile(resolved, "healthFactor");
    return compile(ctx, module, chainId, account);
  },
});
