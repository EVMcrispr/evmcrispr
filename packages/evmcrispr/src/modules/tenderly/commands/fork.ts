import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { mainnet } from "viem/chains";

import { ErrorException } from "../../../errors";

import type { Action, ICommand } from "../../../types";
import {
  BindingsSpace,
  NodeType,
  isProviderAction,
  isSwitchAction,
} from "../../../types";

import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from "../../../utils";

import type { Tenderly } from "../Tenderly";

export const fork: ICommand<Tenderly> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });
    checkOpts(c, ["block-number", "from"]);

    // set up your access-key, if you don't have one or you want to generate new one follow next link
    // https://dashboard.tenderly.co/account/authorization
    const tenderly = module.bindingsManager.getBindingValue(
      "$tenderly",
      BindingsSpace.USER,
    );
    const [tenderlyUser, tenderlyProject, tenderlyAccessKey] =
      tenderly?.split("/") || [];

    if (!tenderlyAccessKey) {
      throw new ErrorException(
        "No $tenderly variable definied or not definied properly",
      );
    }

    const [blockExpressionNode] = c.args;
    const blockNumber = await getOptValue(c, "block-number", interpretNode);
    const from = await getOptValue(c, "from", interpretNode);

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException("last argument should be a set of commands");
    }

    const TENDERLY_FORK_API = `https://api.tenderly.co/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/fork`;

    const body = {
      network_id: String(await module.getChainId()),
      block_number: blockNumber ? Number(blockNumber.toString()) : undefined,
    };

    const opts = {
      method: "POST",
      headers: {
        "X-Access-Key": tenderlyAccessKey as string,
      },
      body: JSON.stringify(body),
    };

    const forkId = await fetch(TENDERLY_FORK_API, opts)
      .then((res) => res.json())
      .then((data: any) => data.simulation_fork.id);

    const forkRPC = `https://rpc.tenderly.co/fork/${forkId}`;

    const publicClient = createPublicClient({
      chain: mainnet, // It is not used by Tenderly, but it is required to be passed
      transport: http(forkRPC),
    });
    const walletClient = createWalletClient({
      chain: mainnet,
      transport: http(forkRPC),
    });

    module.evmcrispr.setConnectedAccount(from);
    module.evmcrispr.setClient(publicClient);

    const simulateAction = async (action: Action) => {
      if (isSwitchAction(action)) {
        throw new ErrorException(`can't switch networks inside a fork command`);
      }
      if (isProviderAction(action)) {
        await walletClient.request({
          method: action.method as any,
          params: action.params as any,
        });
      } else {
        const tx = await walletClient.request({
          method: "eth_sendTransaction",
          params: [
            {
              ...action,
              from: action.from || (await module.getConnectedAccount()),
              value: toHex(action.value || 0n),
            },
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: tx,
        });
        if (receipt.status === "reverted") {
          module.evmcrispr.log(
            `:error: A transaction failed: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/fork/${forkId}).`,
          );
          throw new ErrorException(`Transaction failed.`);
        }
      }
    };

    await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
      actionCallback: simulateAction,
    });

    module.evmcrispr.setClient(undefined);
    module.evmcrispr.setConnectedAccount(undefined);

    module.evmcrispr.log(
      `:success: All transactions succeeded: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/fork/${forkId}).`,
    );

    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
