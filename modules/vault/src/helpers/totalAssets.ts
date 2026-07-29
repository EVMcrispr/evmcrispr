import { defineHelper } from "@evmcrispr/sdk";
import type Vault from "..";
import { readVaultUint } from "../erc4626";

export default defineHelper<Vault>({
  name: "totalAssets",
  batchable: false,
  description:
    "Total amount of underlying assets managed by an ERC-4626 vault, in base units of the asset.",
  returnType: "number",
  args: [
    {
      name: "vault",
      type: "address",
      description: "ERC-4626 vault address",
    },
  ],
  async run(module, { vault }) {
    return (await readVaultUint(module, vault, "totalAssets")).toString();
  },
});
