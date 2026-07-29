import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type Vault from "..";
import { readVaultUint } from "../erc4626";

export default defineHelper<Vault>({
  name: "convertToShares",
  batchable: false,
  description:
    "Amount of shares an ERC-4626 vault would mint for a given amount of underlying assets, in base units of the share token.",
  returnType: "number",
  args: [
    {
      name: "vault",
      type: "address",
      description: "ERC-4626 vault address",
    },
    {
      name: "assets",
      type: "number",
      description: "Asset amount, in base units (wei)",
    },
  ],
  async run(module, { vault, assets }) {
    const amount = Num(assets).toBigInt();
    if (amount < 0n) {
      throw new ErrorException("<assets> must not be negative");
    }
    return (
      await readVaultUint(module, vault, "convertToShares", [amount])
    ).toString();
  },
});
