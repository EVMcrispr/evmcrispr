import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  toHex,
  type WalletClient,
} from "viem";
import { mainnet } from "viem/chains";

import { ErrorException } from "../../../errors";

import type { Action, ICommand } from "../../../types";
import {
  isRpcAction,
  isTransactionAction,
  isWalletAction,
  NodeType,
} from "../../../types";

import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from "../../../utils";

import type { Sim } from "../Sim";

export const fork: ICommand<Sim> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });
    checkOpts(c, ["block-number", "from", "tenderly", "using"]);

    const [blockExpressionNode] = c.args;
    const blockNumber = await getOptValue(c, "block-number", interpretNode);
    const from = await getOptValue(c, "from", interpretNode);
    const using = await getOptValue(c, "using", interpretNode);
    const tenderlyOpt = await getOptValue(c, "tenderly", interpretNode);

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException("last argument should be a set of commands");
    }

    const chainId = await module.getChainId();

    let publicClient: PublicClient;
    let walletClient: WalletClient;
    let onSuccess: (() => void) | undefined;
    let onError: (() => void) | undefined;

    if (using === "anvil") {
      // ── Anvil backend ──────────────────────────────────────────────
      const anvilRPC = "http://localhost:8545";

      publicClient = createPublicClient({
        chain: mainnet,
        transport: http(anvilRPC),
      });
      walletClient = createWalletClient({
        chain: mainnet,
        transport: http(anvilRPC),
      });

      // Verify chain ID matches
      let anvilChainId: number;
      try {
        anvilChainId = await publicClient.getChainId();
      } catch (e) {
        throw new ErrorException(
          `Failed to connect to Anvil at ${anvilRPC}. Make sure Anvil is running.`,
        );
      }

      if (anvilChainId !== chainId) {
        throw new ErrorException(
          `Chain ID mismatch: expected ${chainId} but Anvil is forking chain ${anvilChainId}.`,
        );
      }

      // Verify block number if specified
      if (blockNumber) {
        const anvilBlockNumber = await publicClient.getBlockNumber();
        const expectedBlockNumber = BigInt(blockNumber.toString());
        if (anvilBlockNumber !== expectedBlockNumber) {
          throw new ErrorException(
            `Block number mismatch: expected ${expectedBlockNumber} but Anvil is at block ${anvilBlockNumber}.`,
          );
        }
      }

      onSuccess = () => {
        module.evmcrispr.log(
          `:success: All transactions succeeded on Anvil fork.`,
        );
      };
    } else if (tenderlyOpt) {
      // ── Tenderly backend ───────────────────────────────────────────
      // set up your access-key, if you don't have one or you want to generate new one follow next link
      // https://dashboard.tenderly.co/account/authorization
      const [tenderlyUser, tenderlyProject, tenderlyAccessKey] =
        (tenderlyOpt as string)?.split("/") || [];

      if (!tenderlyAccessKey) {
        throw new ErrorException(
          "Invalid --tenderly option. Expected format: user/project/accessKey",
        );
      }

      // Create Virtual TestNet
      const TENDERLY_VNET_API = `https://api.tenderly.co/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/vnets`;

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

      if (blockNumber) {
        vnetBody.fork_config.block_number = Number(blockNumber.toString());
      }

      const vnetOpts = {
        method: "POST",
        headers: {
          "X-Access-Key": tenderlyAccessKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vnetBody),
      };

      const vnetResponse = await fetch(TENDERLY_VNET_API, vnetOpts).then(
        (res) => res.json(),
      );

      if (!vnetResponse.id) {
        throw new ErrorException(
          `Failed to create Virtual TestNet: ${JSON.stringify(vnetResponse)}`,
        );
      }

      const vnetId = vnetResponse.id;
      const vnetRPC = vnetResponse.rpcs?.[0]?.url || vnetResponse.admin_rpc_url;

      publicClient = createPublicClient({
        chain: mainnet, // Not used by Tenderly, but required to be passed
        transport: http(vnetRPC),
      });
      walletClient = createWalletClient({
        chain: mainnet,
        transport: http(vnetRPC),
      });

      onError = () => {
        module.evmcrispr.log(
          `:error: A transaction failed: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/testnet/${vnetId}).`,
        );
      };

      onSuccess = () => {
        module.evmcrispr.log(
          `:success: All transactions succeeded: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/testnet/${vnetId}).`,
        );
      };
    } else if (using) {
      throw new ErrorException(
        `Unknown simulation backend: "${using}". Supported: anvil`,
      );
    } else {
      throw new ErrorException(
        "Must specify --using anvil or --tenderly user/project/accessKey",
      );
    }

    if (from) {
      module.evmcrispr.setConnectedAccount(from);
    }
    module.evmcrispr.setClient(publicClient);

    const simulateAction = async (action: Action) => {
      if (isWalletAction(action)) {
        throw new ErrorException(`can't switch networks inside a fork command`);
      }
      if (isRpcAction(action)) {
        await walletClient.request({
          method: action.method as any,
          params: action.params as any,
        });
      } else if (isTransactionAction(action)) {
        const tx = await walletClient.request({
          method: "eth_sendTransaction",
          params: [
            {
              to: action.to,
              data: action.data,
              from: action.from || (await module.getConnectedAccount()),
              value: toHex(action.value || 0n),
              ...(action.gas !== undefined && { gas: toHex(action.gas) }),
              ...(action.maxFeePerGas !== undefined && {
                maxFeePerGas: toHex(action.maxFeePerGas),
              }),
              ...(action.maxPriorityFeePerGas !== undefined && {
                maxPriorityFeePerGas: toHex(action.maxPriorityFeePerGas),
              }),
              ...(action.nonce !== undefined && { nonce: toHex(action.nonce) }),
            },
          ],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: tx,
        });
        if (receipt.status === "reverted") {
          onError?.();
          throw new ErrorException(`Transaction failed.`);
        }
        return receipt;
      }
    };

    await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
      actionCallback: simulateAction,
    });

    module.evmcrispr.setClient(undefined);
    module.evmcrispr.setConnectedAccount(undefined);

    onSuccess?.();

    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
