import { defineCommand, ErrorException, fieldItem } from "@evmcrispr/sdk";
import type Lending from "..";
import { resolveAdapter } from "../adapters/registry";
import { rejectNative } from "../utils/amounts";

export default defineCommand<Lending>({
  name: "set-collateral",
  description:
    "Enable or disable a supplied token as collateral for the connected account's borrows.",
  args: [
    {
      name: "token",
      type: "address",
      description: "Supplied token to toggle (use @token(SYM))",
    },
    {
      name: "mode",
      type: "command",
      description: "`on` to use the token as collateral, `off` to stop",
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
  completions: {
    mode: () => [fieldItem("on"), fieldItem("off")],
  },
  async run(module, { token, mode }, { opts }) {
    if (mode !== "on" && mode !== "off") {
      throw new ErrorException(`<mode> must be \`on\` or \`off\`, got ${mode}`);
    }
    rejectNative(token);
    const chainId = await module.getChainId();
    const adapter = await resolveAdapter(module, opts.using);
    if (!adapter.buildSetCollateral) {
      throw new ErrorException(
        `${adapter.name} manages collateral automatically and does not support set-collateral`,
      );
    }
    const plan = await adapter.buildSetCollateral(module, {
      chainId,
      token,
      enabled: mode === "on",
    });
    return plan.actions;
  },
});
