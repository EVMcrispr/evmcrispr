import { defineHelper } from "@evmcrispr/sdk";
import type Vault from "..";
import { vaultShare } from "../erc7540";

export default defineHelper<Vault>({
  name: "share",
  batchable: false,
  description:
    "Share token address of a vault. ERC-7575 vaults expose a separate share token; plain ERC-4626 vaults are their own share token, so the vault address itself is returned.",
  returnType: "address",
  args: [
    {
      name: "vault",
      type: "address",
      description: "Vault address (ERC-7575 or plain ERC-4626)",
    },
  ],
  async run(module, { vault }) {
    return vaultShare(module, vault);
  },
});
