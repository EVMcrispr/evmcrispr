import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Vault from "..";
import { erc4626Abi, readVaultUint } from "../erc4626";

export default defineHelper<Vault>({
  name: "convertToShares",
  batchable: false,
  description:
    "Amount of shares an ERC-4626 vault would mint for a given amount of underlying assets, in base units of the share token. As @convertToShares! the conversion is read on-chain at assertion time — the assets argument may itself be a live call.",
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
  compile: async (ctx, node) => {
    const vault = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    return callReadOperand(
      ctx,
      vault,
      getAbiItem({ abi: erc4626Abi, name: "convertToShares" }) as AbiFunction,
      [node.args[1]],
      "Uint",
    );
  },
});
