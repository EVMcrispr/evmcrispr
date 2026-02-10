import * as chains from "viem/chains";

import { ErrorException } from "../../../errors";
import type { WalletAction } from "../../../types";
import { defineCommand } from "../../../utils";
import type { Std } from "..";

const nameToChainId = Object.entries(chains).reduce(
  (acc, [name, { id }]) => {
    acc[name] = id;
    return acc;
  },
  {} as Record<string, number>,
);

export default defineCommand<Std>({
  name: "switch",
  args: [{ name: "networkNameOrId", type: "any" }],
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
  buildCompletionItemsForArg(argIndex) {
    switch (argIndex) {
      case 0:
        return [...Object.keys(nameToChainId)];
      default:
        return [];
    }
  },
});
