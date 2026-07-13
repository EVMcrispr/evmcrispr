import { defineCommand, ErrorException, Num } from "@evmcrispr/sdk";
import type Lending from "..";
import { resolveAdapter } from "../adapters/registry";

export default defineCommand<Lending>({
  name: "set-emode",
  description:
    "Set the connected account's efficiency-mode category, unlocking higher LTV between correlated assets (e.g. stablecoins). Category 0 disables e-mode.",
  args: [
    {
      name: "categoryId",
      type: "number",
      description: "E-mode category id (0 disables e-mode)",
    },
  ],
  opts: [
    {
      name: "using",
      type: "lending-adapter",
      description:
        "Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain)",
    },
  ],
  async run(module, { categoryId }, { opts }) {
    const category = Num(categoryId).toBigInt();
    if (category < 0n || category > 255n) {
      throw new ErrorException(
        `<categoryId> must be between 0 and 255, got ${categoryId}`,
      );
    }
    const chainId = await module.getChainId();
    const adapter = await resolveAdapter(module, opts.using);
    if (!adapter.buildSetEmode) {
      throw new ErrorException(`${adapter.name} does not support e-mode`);
    }
    const plan = await adapter.buildSetEmode(module, {
      chainId,
      categoryId: Number(category),
    });
    return plan.actions;
  },
});
