import { defineHelper } from "@evmcrispr/sdk";
import {
  coreCall,
  encodeOrElse,
  rawParam,
  staticCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
import type Vault from "..";
import { erc7540Abi, vaultShare } from "../erc7540";

export default defineHelper<Vault>({
  name: "share",
  batchable: false,
  description:
    "Share token address of a vault. ERC-7575 vaults expose a separate share token; plain ERC-4626 vaults are their own share token, so the vault address itself is returned. As @share! the share() read happens on-chain at assertion time, falling back to the vault address itself through the core's orElse when share() is absent (plain ERC-4626).",
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
  compile: async (ctx, node) => {
    const vault = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    // orElse(share(), vault): plain ERC-4626 vaults have no share() and
    // ARE their own share token, mirroring the run face's fallback.
    return coreCall(
      ctx,
      encodeOrElse(
        staticCallParam(
          vault,
          encodeFunctionData({ abi: erc7540Abi, functionName: "share" }),
        ),
        rawParam(toWord(BigInt(vault))),
      ),
      "Address",
    );
  },
});
