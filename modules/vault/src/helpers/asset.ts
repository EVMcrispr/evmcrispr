import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Vault from "..";
import { erc4626Abi, vaultAsset } from "../erc4626";

export default defineHelper<Vault>({
  name: "asset",
  batchable: false,
  description:
    "Underlying asset token address of an ERC-4626 vault. As @asset! the asset() read happens on-chain at assertion time.",
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
  compile: async (ctx, node) => {
    const vault = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    return callReadOperand(
      ctx,
      vault,
      getAbiItem({ abi: erc4626Abi, name: "asset" }) as AbiFunction,
      [],
      "Address",
    );
  },
});
