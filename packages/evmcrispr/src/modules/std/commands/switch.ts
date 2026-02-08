import * as chains from "viem/chains";

import { ErrorException } from "../../../errors";
import type { ICommand, WalletAction } from "../../../types";
import { ComparisonType, checkArgsLength } from "../../../utils";
import type { Std } from "../Std";

const nameToChainId = Object.entries(chains).reduce(
  (acc, [name, { id }]) => {
    acc[name] = id;
    return acc;
  },
  {} as Record<string, number>,
);

export const _switch: ICommand<Std> = {
  async run(module, c, { interpretNodes }): Promise<WalletAction[]> {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });

    // TODO: Consider if we need this check
    // const provider = await module.getClient();
    // if (!(provider instanceof providers.JsonRpcProvider)) {
    //   throw new ErrorException("JSON-RPC based providers supported only");
    // }

    const [networkNameOrId] = await interpretNodes(c.args);

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
  async runEagerExecution() {
    return;
  },
};
