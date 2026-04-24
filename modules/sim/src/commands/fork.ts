import {
  type Action,
  type BlockExpressionNode,
  type Chain,
  defineCommand,
  ErrorException,
  isRpcAction,
  isTransactionAction,
  isWalletAction,
  RevertError,
} from "@evmcrispr/sdk";
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  toHex,
  type WalletClient,
} from "viem";
import type Sim from "..";
import {
  createEthereumJSBackend,
  type EthereumJSBackend,
} from "../lib/ethereumjs-backend";

export default defineCommand<Sim>({
  name: "fork",
  description: "Fork the blockchain and execute commands in a simulation.",
  args: [
    {
      name: "block",
      type: "block",
      description: "Commands to execute in the fork",
    },
  ],
  opts: [
    {
      name: "block-number",
      type: "number",
      description: "Block number to fork from",
    },
    { name: "from", type: "address", description: "Default sender address" },
    {
      name: "auth-token",
      type: "string",
      description: "RPC provider authentication token",
    },
    {
      name: "using",
      type: "simulation-mode",
      description: "Simulation backend (anvil, hardhat, tenderly, ethereumjs)",
    },
  ],
  async run(module, { block }, { opts, interpreters }) {
    const { interpretNode } = interpreters;
    const blockExpressionNode = block as BlockExpressionNode;

    const blockNumber = opts["block-number"];
    const from = opts.from;
    const using = opts.using;
    const tenderlyOpt = opts["auth-token"];

    const chainId = await module.getChainId();

    const chain = ((await module.getChain()) ?? {
      id: chainId,
      name: "Unknown",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [] } },
    }) as Chain;

    const upstreamTransport = module.getTransport(chainId);
    const upstreamRpcUrl = (upstreamTransport({ chain }) as any).value?.url as
      | string
      | undefined;

    let publicClient: PublicClient;
    let walletClient: WalletClient;
    let backend: EthereumJSBackend | undefined;
    let onSuccess: (() => void) | undefined;
    let onError: (() => void) | undefined;

    if (using === "anvil" || using === "hardhat") {
      // ── Anvil / Hardhat backend ──────────────────────────────────
      const rpcUrl = "http://localhost:8545";

      const backendName = using === "anvil" ? "Anvil" : "Hardhat";

      publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });
      walletClient = createWalletClient({
        chain,
        transport: http(rpcUrl),
      });

      // Reset the node to fork from the upstream RPC at the desired block
      const resetMethod = using === "anvil" ? "anvil_reset" : "hardhat_reset";
      const resetParams: any[] = [];
      if (upstreamRpcUrl) {
        const forkingConfig: any = { jsonRpcUrl: upstreamRpcUrl };
        if (blockNumber) {
          forkingConfig.blockNumber = Number(blockNumber.toString());
        }
        resetParams.push({ forking: forkingConfig });
      }

      try {
        await walletClient.request({
          method: resetMethod as any,
          params: resetParams as any,
        });
      } catch (e) {
        throw new ErrorException(
          `Failed to reset ${backendName} at ${rpcUrl}. Make sure ${backendName} is running: ${(e as Error).message}`,
        );
      }

      module.mode = using;

      onSuccess = () => {
        module.context.log(
          `:success: All transactions succeeded on ${backendName} fork.`,
        );
      };
    } else if (using === "tenderly" || tenderlyOpt) {
      // ── Tenderly backend ───────────────────────────────────────────
      // set up your access-key, if you don't have one or you want to generate new one follow next link
      // https://dashboard.tenderly.co/account/authorization
      if (!tenderlyOpt) {
        throw new ErrorException(
          "--using tenderly requires --auth-token user/project/accessKey",
        );
      }

      const [tenderlyUser, tenderlyProject, tenderlyAccessKey] =
        (tenderlyOpt as string)?.split("/") || [];

      if (!tenderlyAccessKey) {
        throw new ErrorException(
          "Invalid --auth-token option. Expected format: user/project/accessKey",
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
        chain,
        transport: http(vnetRPC),
      });
      walletClient = createWalletClient({
        chain,
        transport: http(vnetRPC),
      });

      onError = () => {
        module.context.log(
          `:error: A transaction failed: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/testnet/${vnetId}).`,
        );
      };

      module.mode = "tenderly";

      onSuccess = () => {
        module.context.log(
          `:success: All transactions succeeded: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/testnet/${vnetId}).`,
        );
      };
    } else if (using && using !== "ethereumjs") {
      throw new ErrorException(
        `Unknown simulation backend: "${using}". Supported: anvil, hardhat, ethereumjs`,
      );
    } else {
      // ── EthereumJS in-browser backend (default) ──────────────────
      if (!upstreamRpcUrl) {
        throw new ErrorException(
          "EthereumJS backend requires an upstream RPC URL. Make sure a transport is configured.",
        );
      }

      backend = await createEthereumJSBackend({
        upstreamRpcUrl,
        blockNumber: blockNumber ? Number(blockNumber.toString()) : undefined,
        chainId,
      });

      publicClient = createPublicClient({
        chain,
        transport: backend.transport,
      });

      walletClient = undefined as any;

      module.mode = "ethereumjs";

      onSuccess = () => {
        module.context.log(
          `:success: All transactions succeeded in-browser (EthereumJS).`,
        );
      };
    }

    if (from) {
      module.context.setConnectedAccount(from);
    }
    module.context.setClient(publicClient);

    const withImpersonation = async <T>(
      sender: string,
      fn: () => Promise<T>,
    ): Promise<T> => {
      if (module.mode === "anvil" || module.mode === "hardhat") {
        await walletClient.request({
          method: `${module.mode}_impersonateAccount` as any,
          params: [sender] as any,
        });
      }
      try {
        return await fn();
      } finally {
        if (module.mode === "anvil" || module.mode === "hardhat") {
          await walletClient.request({
            method: `${module.mode}_stopImpersonatingAccount` as any,
            params: [sender] as any,
          });
        }
      }
    };

    const simulateAction = async (action: Action) => {
      if (isWalletAction(action)) {
        throw new ErrorException(`can't switch networks inside a fork command`);
      }

      if (module.mode === "ethereumjs" && backend) {
        if (isTransactionAction(action) && !action.from) {
          action = { ...action, from: await module.getConnectedAccount() };
        }
        return backend.handleAction(action);
      }

      if (isRpcAction(action)) {
        await walletClient.request({
          method: action.method as any,
          params: action.params as any,
        });
      } else if (isTransactionAction(action)) {
        const sender = action.from || (await module.getConnectedAccount());

        return withImpersonation(sender, async () => {
          const tx = await walletClient.request({
            method: "eth_sendTransaction",
            params: [
              {
                to: action.to,
                data: action.data,
                from: sender,
                value: toHex(action.value || 0n),
                ...(action.gas !== undefined && { gas: toHex(action.gas) }),
                ...(action.maxFeePerGas !== undefined && {
                  maxFeePerGas: toHex(action.maxFeePerGas),
                }),
                ...(action.maxPriorityFeePerGas !== undefined && {
                  maxPriorityFeePerGas: toHex(action.maxPriorityFeePerGas),
                }),
                ...(action.nonce !== undefined && {
                  nonce: toHex(action.nonce),
                }),
              },
            ],
          });
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: tx,
          });
          if (receipt.status === "reverted") {
            onError?.();
            // Replay via eth_call to extract revert data
            let revertData: `0x${string}` | undefined;
            try {
              await publicClient.call({
                to: action.to,
                data: action.data,
                account: sender as `0x${string}`,
                value: action.value,
                gas: action.gas,
                blockNumber: receipt.blockNumber,
              });
            } catch (callErr: any) {
              if (
                callErr?.data &&
                typeof callErr.data === "string" &&
                callErr.data.startsWith("0x")
              ) {
                revertData = callErr.data as `0x${string}`;
              } else if (callErr?.walk) {
                callErr.walk((inner: any) => {
                  if (
                    !revertData &&
                    inner?.data &&
                    typeof inner.data === "string" &&
                    inner.data.startsWith("0x")
                  ) {
                    revertData = inner.data as `0x${string}`;
                  }
                });
              }
            }
            throw new RevertError(`Transaction failed.`, revertData);
          }
          return receipt;
        });
      }
    };

    await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
      actionCallback: simulateAction,
    });

    module.mode = null;
    module.context.setClient(undefined);
    module.context.setConnectedAccount(undefined);

    onSuccess?.();

    return [];
  },
});
