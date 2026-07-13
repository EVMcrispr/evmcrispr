import { defineHelper } from "@evmcrispr/sdk";
import type Lending from "..";
import { requireRead, resolveAdapter } from "../adapters/registry";

export default defineHelper<Lending>({
  name: "debt",
  batchable: false,
  description:
    "Current variable-rate debt of an account in a token, in base units (grows every block as interest accrues).",
  returnType: "number",
  args: [
    { name: "account", type: "address", description: "Account to inspect" },
    {
      name: "token",
      type: "address",
      description: "Borrowed token (use @token(SYM))",
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
    const read = requireRead(resolved, "debt");
    return (await read(module, chainId, account, token)).toString();
  },
});
