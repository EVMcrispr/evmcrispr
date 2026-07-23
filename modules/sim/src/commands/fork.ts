import {
  type Action,
  type BlockExpressionNode,
  defineCommand,
  ErrorException,
  isBatchedAction,
  isRpcAction,
  isTerminalAction,
  isTransactionAction,
  isWalletAction,
  RevertError,
} from "@evmcrispr/sdk";
import {
  type Address,
  encodeAbiParameters,
  keccak256,
  numberToHex,
  toHex,
} from "viem";
import type Sim from "..";
import type { SimMode } from "..";
import {
  DELEGATOR_ADDRESS,
  DELEGATOR_BYTECODE,
  delegationDesignator,
  encodeBatchExecute,
  parseDelegation,
} from "../lib/delegate";
import {
  collectSwitchTargets,
  ForkManager,
  type TenderlyAuth,
} from "../lib/forks";
import { rpcPrefix } from "../lib/modes";
import { matchesSourceEvent, type ReceiptLog } from "../lib/relay";
import { buildWaitActions } from "../lib/wait";

const BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// How many storage slots to probe when locating a token's balance mapping.
const DEAL_MAX_SLOT = 25;

export default defineCommand<Sim>({
  name: "fork",
  description: "Fork the blockchain and execute commands in a simulation.",
  batchable: false,
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
      description:
        "Simulation backend (anvil, hardhat, tenderly, tenderly-multichain, ethereumjs)",
    },
  ],
  async run(module, { block }, { opts, interpreters }) {
    const { interpretNode } = interpreters;
    const blockExpressionNode = block as BlockExpressionNode;

    const blockNumber = opts["block-number"];
    const from = opts.from;
    const using = opts.using as SimMode | undefined;
    const tenderlyOpt = opts["auth-token"] as string | undefined;

    const chainId = await module.getChainId();

    const mode: SimMode = using ?? (tenderlyOpt ? "tenderly" : "ethereumjs");
    if (
      ![
        "anvil",
        "hardhat",
        "tenderly",
        "tenderly-multichain",
        "ethereumjs",
      ].includes(mode)
    ) {
      throw new ErrorException(
        `Unknown simulation backend: "${mode}". Supported: anvil, hardhat, tenderly, tenderly-multichain, ethereumjs`,
      );
    }

    let auth: TenderlyAuth | undefined;
    if (mode === "tenderly" || mode === "tenderly-multichain") {
      // set up your access-key, if you don't have one or you want to generate
      // a new one follow https://dashboard.tenderly.co/account/authorization
      if (!tenderlyOpt) {
        throw new ErrorException(
          `--using ${mode} requires --auth-token user/project/accessKey`,
        );
      }
      const [user, project, accessKey] = tenderlyOpt.split("/") || [];
      if (!accessKey) {
        throw new ErrorException(
          "Invalid --auth-token option. Expected format: user/project/accessKey",
        );
      }
      auth = { user, project, accessKey };
    }

    const forkManager = new ForkManager(module, mode, {
      blockNumber: blockNumber ? Number(blockNumber.toString()) : undefined,
      auth,
      // The environments API needs every network at creation time, so scan
      // the block for literal switch targets upfront.
      multichainTargets:
        mode === "tenderly-multichain"
          ? collectSwitchTargets(blockExpressionNode)
          : undefined,
    });

    await forkManager.init(chainId);
    module.mode = mode;
    module.activeChainId = chainId;
    if (from) {
      module.context.setConnectedAccount(from);
    }
    module.context.setClient(forkManager.active.publicClient);

    const prefix = rpcPrefix(mode);
    let relaySeq = 0;

    const logTenderlyLinks = (outcome: string) => {
      for (const link of forkManager.tenderlyLinks) {
        module.context.log(
          `${outcome}: [*Click here to watch on Tenderly*](${link}).`,
        );
      }
    };

    const onError = () => {
      if (mode === "tenderly" || mode === "tenderly-multichain") {
        logTenderlyLinks(":error: A transaction failed");
      }
    };

    const withImpersonation = async <T>(
      sender: string,
      fn: () => Promise<T>,
    ): Promise<T> => {
      const walletClient = forkManager.active.walletClient;
      if (mode === "anvil" || mode === "hardhat") {
        await walletClient!.request({
          method: `${mode}_impersonateAccount` as any,
          params: [sender] as any,
        });
      }
      try {
        return await fn();
      } finally {
        if (mode === "anvil" || mode === "hardhat") {
          await walletClient!.request({
            method: `${mode}_stopImpersonatingAccount` as any,
            params: [sender] as any,
          });
        }
      }
    };

    // ── Cross-chain relay ────────────────────────────────────────────────

    const scanAndQueue = async (logs: ReceiptLog[]): Promise<void> => {
      if (module.relayHandlers.length === 0 || logs.length === 0) return;
      const srcChainId = forkManager.active.chainId;
      for (const log of logs) {
        for (const handler of module.relayHandlers) {
          const events = handler.sourceEvents(srcChainId);
          if (!events.some((event) => matchesSourceEvent(log, event))) {
            continue;
          }
          const parsed = await handler.parse(log, { srcChainId, txLogs: logs });
          if (!parsed) continue;
          module.pendingDeliveries.push({
            handlerId: handler.id,
            srcChainId,
            dstChainId: parsed.dstChainId,
            log,
            txLogs: logs,
            seq: relaySeq++,
            note: parsed.note,
          });
          module.context.log(
            `Queued ${handler.id} transfer ${srcChainId} → ${parsed.dstChainId}` +
              (parsed.note ? ` (${parsed.note})` : ""),
          );
        }
      }
    };

    const drainDeliveries = async (dstChainId: number): Promise<void> => {
      for (;;) {
        const idx = module.pendingDeliveries.findIndex(
          (d) => d.dstChainId === dstChainId,
        );
        if (idx === -1) return;
        const [delivery] = module.pendingDeliveries.splice(idx, 1);
        const handler = module.relayHandlers.find(
          (h) => h.id === delivery.handlerId,
        );
        if (!handler) continue;
        module.context.log(
          `Delivering ${delivery.handlerId} transfer from chain ${delivery.srcChainId}`,
        );
        const actions = await handler.buildDelivery(module, delivery.log, {
          srcChainId: delivery.srcChainId,
          dstChainId,
          txLogs: delivery.txLogs,
        });
        // Delivery receipts are deliberately not relay-scanned: a mocked
        // destination leg that emits a watched event must not chain-relay.
        for (const action of actions) {
          await execAction(action, { relayScan: false });
        }
      }
    };

    const activateFork = async (dstChainId: number): Promise<void> => {
      const handle = await forkManager.activate(dstChainId);
      // `switch` already rebuilt the interpreter client against the real
      // chain at interpret time — repair it to point at the fork.
      module.context.setClient(handle.publicClient);
      module.activeChainId = dstChainId;
      await drainDeliveries(dstChainId);
    };

    // ── Virtual admin methods for relay deliveries ───────────────────────

    const readTokenBalance = (token: Address, owner: Address) =>
      forkManager.active.publicClient.readContract({
        address: token,
        abi: BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [owner],
      }) as Promise<bigint>;

    /** foundry-`deal` style: locate the balance slot by probing, then set it. */
    const dealToken = async (
      token: Address,
      to: Address,
      amountHex: `0x${string}`,
    ): Promise<void> => {
      const amount = BigInt(amountHex);
      const current = await readTokenBalance(token, to);
      if (current === amount) return;
      const value32 = numberToHex(amount, { size: 32 });

      for (let slot = 0; slot < DEAL_MAX_SLOT; slot++) {
        const candidates = [
          // Solidity: keccak256(abi.encode(holder, uint256(slot)))
          keccak256(
            encodeAbiParameters(
              [{ type: "address" }, { type: "uint256" }],
              [to, BigInt(slot)],
            ),
          ),
          // Vyper: keccak256(abi.encode(uint256(slot), holder))
          keccak256(
            encodeAbiParameters(
              [{ type: "uint256" }, { type: "address" }],
              [BigInt(slot), to],
            ),
          ),
        ];
        for (const slotKey of candidates) {
          const prev = await forkManager.active.publicClient.getStorageAt({
            address: token,
            slot: slotKey,
          });
          await execAction(
            {
              type: "rpc",
              method: `${prefix}_setStorageAt`,
              params: [token, slotKey, value32],
            },
            { relayScan: false },
          );
          const balance = await readTokenBalance(token, to).catch(() => null);
          if (balance === amount) return;
          await execAction(
            {
              type: "rpc",
              method: `${prefix}_setStorageAt`,
              params: [token, slotKey, prev ?? numberToHex(0n, { size: 32 })],
            },
            { relayScan: false },
          );
        }
      }
      throw new ErrorException(
        `sim_dealToken: couldn't locate the balance storage slot for token ${token}`,
      );
    };

    const addNativeBalance = async (
      address: Address,
      amountHex: `0x${string}`,
    ): Promise<void> => {
      const balance = await forkManager.active.publicClient.getBalance({
        address,
      });
      await execAction(
        {
          type: "rpc",
          method: `${prefix}_setBalance`,
          params: [address, toHex(balance + BigInt(amountHex))],
        },
        { relayScan: false },
      );
    };

    // ── Action execution ─────────────────────────────────────────────────

    const execAction = async (
      action: Action,
      { relayScan }: { relayScan: boolean },
    ): Promise<unknown> => {
      if (module.context.signal?.aborted) {
        throw new ErrorException("Execution cancelled");
      }
      if (isWalletAction(action)) {
        if (action.method !== "wallet_switchEthereumChain") {
          throw new ErrorException(
            `can't handle wallet action ${action.method} inside a fork command`,
          );
        }
        const target = (action.params as { chainId?: string | number }[])?.[0]
          ?.chainId;
        const dstChainId = Number(target);
        if (!Number.isInteger(dstChainId) || dstChainId <= 0) {
          throw new ErrorException(
            `invalid switch target inside fork: ${String(target)}`,
          );
        }
        await activateFork(dstChainId);
        return undefined;
      }

      if (isTerminalAction(action) && action.command === "wait") {
        // Real-time waits are simulated by warping the fork's clock instead
        // of sleeping.
        const seconds = BigInt(Number(action.args.seconds ?? 0));
        module.context.log(`Advancing fork time by ${seconds}s`);
        for (const rpcAction of buildWaitActions(module, seconds)) {
          await execAction(rpcAction, { relayScan: false });
        }
        return undefined;
      }

      if (isBatchedAction(action)) {
        // Simulate an EIP-5792 batch the way wallets fulfill it: an EIP-7702
        // delegation on the sender EOA plus a single self-call executing all
        // batched calls atomically through the delegate.
        const publicClient = forkManager.active.publicClient;
        const sender = action.from;
        const senderCode = await publicClient.getCode({ address: sender });
        const existingDelegate = parseDelegation(senderCode);

        if (senderCode && senderCode !== "0x" && !existingDelegate) {
          throw new ErrorException(
            `can't simulate batch from ${sender}: account has contract code that is not an EIP-7702 delegation`,
          );
        }

        if (!existingDelegate) {
          // Seed the delegate contract on forks of chains where it isn't deployed
          const delegatorCode = await publicClient.getCode({
            address: DELEGATOR_ADDRESS,
          });
          if (!delegatorCode || delegatorCode === "0x") {
            await execAction(
              {
                type: "rpc",
                method: `${prefix}_setCode`,
                params: [DELEGATOR_ADDRESS, DELEGATOR_BYTECODE],
              },
              { relayScan: false },
            );
          }
          // Install the delegation designator on the EOA — the same code an
          // actual type-4 (EIP-7702) transaction would set.
          await execAction(
            {
              type: "rpc",
              method: `${prefix}_setCode`,
              params: [sender, delegationDesignator(DELEGATOR_ADDRESS)],
            },
            { relayScan: false },
          );
          module.context.log(
            `Installed EIP-7702 delegation to ${DELEGATOR_ADDRESS} on ${sender}`,
          );
        }

        return execAction(
          {
            from: sender,
            to: sender,
            data: encodeBatchExecute(action.actions),
            chainId: action.chainId,
          },
          { relayScan },
        );
      }

      if (isRpcAction(action)) {
        // Virtual admin methods available to relay deliveries.
        if (action.method === "sim_dealToken") {
          const [token, to, amountHex] = action.params as [
            Address,
            Address,
            `0x${string}`,
          ];
          await dealToken(token, to, amountHex);
          return undefined;
        }
        if (action.method === "sim_addNativeBalance") {
          const [address, amountHex] = action.params as [
            Address,
            `0x${string}`,
          ];
          await addNativeBalance(address, amountHex);
          return undefined;
        }
        if (
          action.method === "evm_increaseTime" &&
          (mode === "anvil" || mode === "hardhat")
        ) {
          forkManager.noteTimeWarp(BigInt(action.params[0] as string));
        }
      }

      if (mode === "ethereumjs") {
        let resolved = action;
        if (isTransactionAction(resolved) && !resolved.from) {
          resolved = { ...resolved, from: await module.getConnectedAccount() };
        }
        const receipt =
          await forkManager.active.backend!.handleAction(resolved);
        if (relayScan && receipt?.logs?.length) {
          await scanAndQueue(receipt.logs);
        }
        return receipt;
      }

      if (isRpcAction(action)) {
        await forkManager.active.walletClient!.request({
          method: action.method as any,
          params: action.params as any,
        });
      } else if (isTransactionAction(action)) {
        const sender = action.from || (await module.getConnectedAccount());

        return withImpersonation(sender, async () => {
          const { publicClient, walletClient } = forkManager.active;
          // The node estimates against the current timestamp, but mining
          // advances it; time-dependent contracts (interest accrual...) can
          // then consume more gas than estimated and die on an opaque inner
          // out-of-gas. Estimate ourselves and add headroom.
          let gas = action.gas;
          if (gas === undefined) {
            try {
              const estimated = await publicClient.estimateGas({
                account: sender as `0x${string}`,
                to: action.to,
                data: action.data,
                value: action.value,
              });
              gas = (estimated * 125n) / 100n;
            } catch {
              // Let the node estimate and surface its own error instead.
            }
          }
          const tx = await walletClient!.request({
            method: "eth_sendTransaction",
            params: [
              {
                to: action.to,
                data: action.data,
                from: sender,
                value: toHex(action.value || 0n),
                ...(gas !== undefined && { gas: toHex(gas) }),
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
            onError();
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
          if (relayScan && receipt.logs.length > 0) {
            await scanAndQueue(receipt.logs as unknown as ReceiptLog[]);
          }
          return receipt;
        });
      }
      // Terminal actions (and rpc actions, handled above) produce no result.
      return undefined;
    };

    const simulateAction = (action: Action) =>
      execAction(action, { relayScan: true });

    try {
      await interpretNode(blockExpressionNode, {
        actionCallback: simulateAction,
        simulation: true,
      });
    } finally {
      if (module.pendingDeliveries.length > 0) {
        const destinations = [
          ...new Set(module.pendingDeliveries.map((d) => d.dstChainId)),
        ].join(", ");
        module.context.log(
          `:warning: ${module.pendingDeliveries.length} bridge transfer(s) were never delivered — ` +
            `the script did not switch to destination chain(s): ${destinations}`,
        );
        module.pendingDeliveries.length = 0;
      }
      module.mode = null;
      module.activeChainId = null;
      // Restore the pre-fork chain so the rest of the script doesn't see the
      // simulated client. `chainId` was captured at the top of `run()` from
      // the script's chain at fork-entry time (preserves any preceding
      // `switch` the script performed). `switchChainId` rebuilds the client
      // from the configured transports for that chain.
      module.context.switchChainId(chainId);
      module.context.setConnectedAccount(undefined);
    }

    if (mode === "tenderly" || mode === "tenderly-multichain") {
      logTenderlyLinks(":success: All transactions succeeded");
    } else if (mode === "anvil" || mode === "hardhat") {
      module.context.log(
        `:success: All transactions succeeded on ${mode === "anvil" ? "Anvil" : "Hardhat"} fork.`,
      );
    } else {
      module.context.log(
        `:success: All transactions succeeded in-browser (EthereumJS).`,
      );
    }

    return [];
  },
});
