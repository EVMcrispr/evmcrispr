import type {
  Address,
  BlockExpressionNode,
  TransactionAction,
} from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Eez from "..";
import {
  CROSS_CHAIN_OVERHEAD,
  type CrossChainCall,
  computeProxy,
  createProxyAction,
  estimateCallGas,
  interpretRemoteBlock,
  isDeployed,
  isProxyOn,
  remoteLabel,
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
    const {
      config,
      remote,
      targetChainId,
      rollupId,
      remoteSender,
      calls,
      remoteFrom,
    } = await interpretRemoteBlock(
      module,
      chain,
      block as BlockExpressionNode,
      interpreters,
      "eez:on",
    );

    // Every distinct target gets its proxy resolved once; the ones nobody
    // created yet get a creation transaction ahead of the calls.
    const targets = new Set<Address>(calls.map((call) => call.to));
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

    const route = async (call: CrossChainCall): Promise<TransactionAction> => {
      const action: TransactionAction = {
        to: proxies.get(call.to)!,
        data: call.data,
        value: call.value,
      };
      if (call.from) action.from = call.from;
      const gas =
        call.gas !== undefined
          ? call.gas
          : await estimateCallGas(
              module,
              config,
              rollupId,
              call.to,
              call.data ?? "0x",
              call.from ? remoteFrom.get(call.from)! : remoteSender,
              // A block collected for later (a timelock schedule, a Safe
              // proposal) runs against state that may not exist yet.
              { failOnRevert: !interpreters.batchContext },
            );
      // A target that is itself a proxy over there (a nested `eez:on`,
      // or a hand-written call to one) goes one hop further; that leg
      // cannot be simulated, so price this chain's overhead on top.
      action.gas = (await isProxyOn(module, targetChainId, remote, call.to))
        ? gas + CROSS_CHAIN_OVERHEAD
        : gas;
      return action;
    };

    const routed: TransactionAction[] = [];
    for (const call of calls) routed.push(await route(call));
    return [...creates, ...routed];
  },
});
