import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { mainnet } from "viem/chains";

import { ErrorException } from "../../../errors";

import type { Action, ICommand } from "../../../types";
import {
  BindingsSpace,
  isProviderAction,
  isSwitchAction,
  NodeType,
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

    const chainId = await module.getChainId();

    // Create Virtual TestNet - using simplified structure matching fork API
    const TENDERLY_VNET_API = `https://api.tenderly.co/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/vnets`;

    // Use minimal required fields based on Tenderly API
    // Try a simplified structure that matches Virtual TestNet creation
    const vnetBody: any = {
      slug: `evmcrispr-${Date.now()}`,
      display_name: `EVMcrispr Virtual TestNet`,
      fork_config: {
        network_id: chainId,
        block_number: blockNumber
          ? blockNumber.toString().startsWith("0x")
            ? blockNumber.toString()
            : `0x${Number(blockNumber).toString(16)}`
          : "latest",
      },
      virtual_network_config: {
        chain_config: {
          chain_id: chainId,
        },
      },
      rpc_config: {
        rpc_name: "evmcrispr-fork",
        persistence_config: {
          methods: [
            {
              method: "tenderly_simulateTransaction",
            },
          ],
        },
      },
      sync_state_config: {
        enabled: false,
      },
      explorer_page_config: {
        enabled: false,
        verification_visibility: "bytecode",
      },
    };

    // Add block_number to fork_config if provided
    if (blockNumber) {
      vnetBody.fork_config.block_number = Number(blockNumber.toString());
    }

    const vnetOpts = {
      method: "POST",
      headers: {
        "X-Access-Key": tenderlyAccessKey as string,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vnetBody),
    };

    const vnetResponse = await fetch(TENDERLY_VNET_API, vnetOpts).then((res) =>
      res.json(),
    );

    if (!vnetResponse.id) {
      throw new ErrorException(
        `Failed to create Virtual TestNet: ${JSON.stringify(vnetResponse)}`,
      );
    }

    const vnetId = vnetResponse.id;
    // Get RPC URL from response
    const vnetRPC = vnetResponse.rpcs?.[0]?.url || vnetResponse.admin_rpc_url;

    const publicClient = createPublicClient({
      chain: mainnet, // It is not used by Tenderly, but it is required to be passed
      transport: http(vnetRPC),
    });
    const walletClient = createWalletClient({
      chain: mainnet,
      transport: http(vnetRPC),
    });

    module.evmcrispr.setConnectedAccount(from);
    module.evmcrispr.setClient(publicClient);

    const simulateAction = async (action: Action) => {
      if (isSwitchAction(action)) {
        throw new ErrorException(
          `can't switch networks inside a Virtual TestNet command`,
        );
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
            `:error: A transaction failed: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/testnet/${vnetId}).`,
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
      `:success: All transactions succeeded: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/testnet/${vnetId}).`,
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
