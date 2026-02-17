import type { WalletAction } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, fieldItem } from "@evmcrispr/sdk";
import * as chains from "viem/chains";
import type Std from "..";

const nameToChainId = Object.entries(chains).reduce(
  (acc, [name, { id }]) => {
    acc[name] = id;
    return acc;
  },
  {} as Record<string, number>,
);

export default defineCommand<Std>({
  name: "switch",
  description: "Switch the active chain by name or ID.",
  args: [{ name: "networkNameOrId", type: "any" }],
  completions: {
    networkNameOrId: () => Object.keys(nameToChainId).map(fieldItem),
  },
  async run(module, { networkNameOrId }): Promise<WalletAction[]> {
    let chainId: number;
    chainId = Number(networkNameOrId.toString());

    if (!Number.isInteger(chainId)) {
      if (typeof networkNameOrId !== "string") {
        throw new ErrorException(
          `Invalid chain id. Expected a string or number, but got ${typeof networkNameOrId}`,
        );
      }
      chainId = nameToChainId[networkNameOrId as keyof typeof nameToChainId];
      if (!chainId) {
        throw new ErrorException(`chain "${networkNameOrId}" not found`);
      }
    }

    await module.switchChainId(chainId);

    return [
      {
        type: "wallet",
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      },
    ];
  },
});
