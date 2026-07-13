import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type Vault from "..";
import { readVaultUint } from "../erc4626";

export default defineHelper<Vault>({
  name: "convertToAssets",
  batchable: false,
  description:
    "Amount of underlying assets an ERC-4626 vault would return for a given amount of shares, in base units of the asset.",
  returnType: "number",
  args: [
    {
      name: "vault",
      type: "address",
      description: "ERC-4626 vault address",
    },
    {
      name: "shares",
      type: "number",
      description: "Share amount, in base units (wei)",
    },
  ],
  async run(module, { vault, shares }) {
    const amount = Num(shares).toBigInt();
    if (amount < 0n) {
      throw new ErrorException("<shares> must not be negative");
    }
    return (
      await readVaultUint(module, vault, "convertToAssets", [amount])
    ).toString();
  },
});
