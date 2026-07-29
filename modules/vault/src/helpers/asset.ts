import { defineHelper } from "@evmcrispr/sdk";
import type Vault from "..";
import { vaultAsset } from "../erc4626";

export default defineHelper<Vault>({
  name: "asset",
  batchable: false,
  description: "Underlying asset token address of an ERC-4626 vault.",
  returnType: "address",
  args: [
    {
      name: "vault",
      type: "address",
      description: "ERC-4626 vault address",
    },
  ],
  async run(module, { vault }) {
    return vaultAsset(module, vault);
  },
});
