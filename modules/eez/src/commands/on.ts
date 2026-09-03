import type {
  Action,
  Address,
  BlockExpressionNode,
  TransactionAction,
} from "@evmcrispr/sdk";
import {
  chainLabel,
  defineCommand,
  ErrorException,
  isTransactionAction,
  resolveChainId,
  withSender,
} from "@evmcrispr/sdk";
import type Eez from "..";
import {
  assertCrossChainCalls,
  CROSS_CHAIN_OVERHEAD,
  type CrossChainCall,
  computeProxy,
  createProxyAction,
  eezConfig,
  eezConfigFor,
  estimateCallGas,
  isDeployed,
  isProxyOn,
  remoteLabel,
  resolveRollup,
} from "../utils/eez";

export default defineCommand<Eez>({
  name: "on",
  description:
    "Run a block of commands on another EEZ chain synchronously from the current one. Every call the block produces goes out through the target's cross-chain proxy and executes on the other side atomically with this transaction; helpers, conditions and loops inside evaluate on that chain. Creates each missing proxy first and estimates the gas the composed calls need.",
  args: [
    {
      name: "chain",
      type: "chain",
      description: "EEZ chain the block runs on (`eezL2`, or its chain id)",
    },
    {
      name: "block",
      type: "block",
      description:
        "Commands whose calls execute on that chain (`exec`, `if`, `loop`, other modules' commands)",
    },
  ],
  async run(module, { chain, block }, { interpreters }) {
    const config = await eezConfig(module);
    const targetChainId = resolveChainId(chain);
    const rollupId = resolveRollup(config, targetChainId);
    const remote = await eezConfigFor(module, targetChainId);
    const sender = await module.getSender();

    const previous = await module.getClient();
    try {
      module.switchChainId(targetChainId);
    } catch {
      throw new ErrorException(
        `${chainLabel(targetChainId)} is not configured — no RPC is known for it in this environment`,
      );
    }
    let calls: ReturnType<typeof assertCrossChainCalls>;
    try {
      // On the other chain the caller shows up as its own cross-chain
      // proxy there: that is what `@sender` resolves to inside the block.
      const remoteSender = await computeProxy(
        module,
        remote,
        sender,
        config.rollupId,
      );
      const actions = await withSender(module, remoteSender, () =>
        interpreters.interpretNode(block as BlockExpressionNode, {
          batchContext: interpreters.batchContext,
        }),
      );
      calls = assertCrossChainCalls(actions ?? [], "eez:on");
    } finally {
      // Restore the exact previous client (not a rebuilt one): inside a
      // simulation that keeps the fork the script was running against.
      module.context.setClient(previous);
    }

    // Every distinct target gets its proxy resolved once; the ones nobody
    // created yet get a creation transaction ahead of the calls.
    const targets = new Set<Address>();
    for (const item of calls) {
      if (isTransactionAction(item)) targets.add(item.to);
      else for (const inner of item.actions) targets.add(inner.to as Address);
    }
    const proxies = new Map<Address, Address>();
    const creates: TransactionAction[] = [];
    for (const target of targets) {
      const proxy = await computeProxy(module, config, target, rollupId);
      proxies.set(target, proxy);
      if (!(await isDeployed(module, proxy))) {
        creates.push(createProxyAction(config.registry, target, rollupId));
      }
      module.context.log(
        `Calling ${target} on ${remoteLabel(config, rollupId)} through proxy ${proxy}`,
      );
    }

    const route = async (
      call: CrossChainCall,
      withGas: boolean,
    ): Promise<TransactionAction> => {
      const action: TransactionAction = {
        to: proxies.get(call.to)!,
        data: call.data,
        value: call.value,
      };
      if (call.from) action.from = call.from;
      if (withGas) {
        const gas =
          call.gas !== undefined
            ? call.gas
            : await estimateCallGas(
                module,
                config,
                rollupId,
                call.to,
                call.data ?? "0x",
                call.from ?? sender,
              );
        // A target that is itself a proxy over there (a nested `eez:on`,
        // or a hand-written call to one) goes one hop further; that leg
        // cannot be simulated, so price this chain's overhead on top.
        action.gas = (await isProxyOn(module, targetChainId, remote, call.to))
          ? gas + CROSS_CHAIN_OVERHEAD
          : gas;
      }
      return action;
    };

    const routed: Action[] = [];
    for (const item of calls) {
      if (isTransactionAction(item)) {
        routed.push(await route(item, true));
        continue;
      }
      // A batch inside the block becomes the same batch on the sending
      // chain: the wallet sends the routed calls atomically, so per-call
      // gas is the wallet's business.
      const inner: TransactionAction[] = [];
      for (const call of item.actions) {
        inner.push(await route(call as CrossChainCall, false));
      }
      routed.push({
        type: "batched",
        chainId: config.chainId,
        from: sender,
        actions: inner,
      });
    }
    return [...creates, ...routed];
  },
});
