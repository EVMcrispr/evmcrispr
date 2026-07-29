import { defineHelper } from "@evmcrispr/sdk";
import type Lending from "..";
import { requireRead, resolveAdapter } from "../adapters/registry";

export default defineHelper<Lending>({
  name: "maxBorrow",
  batchable: false,
  description:
    "How much of a token an account can still borrow against its current collateral, in base units of the token.",
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
});
