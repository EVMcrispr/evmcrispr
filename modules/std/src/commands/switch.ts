import type { WalletAction } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Std from "..";
import { resolveChainId } from "../argTypes";

export default defineCommand<Std>({
  name: "switch",
  description: "Switch the active chain by name or ID.",
  batchable: false,
  args: [
    {
      name: "networkNameOrId",
      type: "chain",
      description:
        "Chain name in camelCase as exported by viem (e.g. `mainnet`, `gnosis`, `baseSepolia`, `polygonZkEvm`) or numeric chain ID",
    },
  ],
  async run(module, { networkNameOrId }): Promise<WalletAction[]> {
    const chainId = resolveChainId(networkNameOrId);

    module.switchChainId(chainId);

    return [
      {
        type: "wallet",
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      },
    ];
  },
});
