import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Vault from "..";
import { erc4626Abi, readVaultUint } from "../erc4626";

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
  compile: async (ctx, node) => {
    const vault = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    return callReadOperand(
      ctx,
      vault,
      getAbiItem({ abi: erc4626Abi, name: "totalAssets" }) as AbiFunction,
      [],
      "Uint",
    );
  },
});
