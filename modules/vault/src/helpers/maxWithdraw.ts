import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Vault from "..";
import { erc4626Abi, readVaultUint } from "../erc4626";

export default defineHelper<Vault>({
  name: "maxWithdraw",
  batchable: false,
  description:
    "Maximum amount of underlying assets an account can withdraw from an ERC-4626 vault, in base units of the asset.",
  returnType: "number",
  args: [
    {
      name: "vault",
      type: "address",
      description: "ERC-4626 vault address",
    },
    {
      name: "account",
      type: "address",
      optional: true,
      description: "Account to inspect (defaults to the connected account)",
    },
  ],
  async run(module, { vault, account }) {
    const owner = account ?? (await module.getConnectedAccount(true));
    return (
      await readVaultUint(module, vault, "maxWithdraw", [owner])
    ).toString();
  },
  compile: async (ctx, node) => {
    const vault = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    const owner = node.args[1] ?? {
      value: await ctx.module.getConnectedAccount(true),
    };
    return callReadOperand(
      ctx,
      vault,
      getAbiItem({ abi: erc4626Abi, name: "maxWithdraw" }) as AbiFunction,
      [owner],
      "Uint",
    );
  },
});
