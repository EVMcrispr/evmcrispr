import { defineHelper } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { compileOperand } from "@evmcrispr/sdk/onchain";
import { getAddress } from "viem";
import type Lending from "..";
import {
  requireCompile,
  requireRead,
  resolveAdapter,
} from "../adapters/registry";

export default defineHelper<Lending>({
  name: "maxBorrow",
  batchable: false,
  description:
    "How much of a token an account can still borrow against its current collateral, in base units of the token.",
  compileDescription:
    "Aave-style markets only — CompoundV3 prices collateral by walking every listed asset, which has no on-chain form; a zero oracle price reads as 0.",
  returnType: "number",
  args: [
    { name: "account", type: "address", description: "Account to inspect" },
    {
      name: "token",
      type: "address",
      description: "Token to borrow (use @token(SYM))",
    },
    {
      name: "adapter",
      type: "lending-adapter",
      optional: true,
      description:
        "Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain)",
    },
  ],
  async run(module, { account, token, adapter }) {
    const resolved = await resolveAdapter(module, adapter);
    const chainId = await module.getChainId();
    const read = requireRead(resolved, "maxBorrow");
    return (await read(module, chainId, account, token)).toString();
  },
  compile: async (ctx, node): Promise<Operand> => {
    const module = ctx.module as Lending;
    const account = await compileOperand(ctx, node.args[0]);
    const token = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[1])),
    );
    const adapter =
      node.args[2] === undefined
        ? undefined
        : String(await ctx.interpreters.interpretNode(node.args[2]));
    const resolved = await resolveAdapter(module, adapter);
    const chainId = await module.getChainId();
    const compile = requireCompile(resolved, "maxBorrow");
    return compile(ctx, module, chainId, account, token);
  },
});
