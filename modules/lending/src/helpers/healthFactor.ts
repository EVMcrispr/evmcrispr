import { defineHelper } from "@evmcrispr/sdk";
import type Lending from "..";
import { requireRead, resolveAdapter } from "../adapters/registry";

export default defineHelper<Lending>({
  name: "healthFactor",
  batchable: false,
  description:
    "Health factor of an account's lending position, 1e18-scaled (below 1e18 the position is liquidatable; uint256.max when the account has no debt). Composes with assertions: assert @lending:healthFactor(@me) >= 1.5e18.",
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
    return (await read(module, chainId, account)).toString();
  },
});
