import type { BlockExpressionNode, TransactionAction } from "@evmcrispr/sdk";
import {
  chainLabel,
  clientFor,
  defineCommand,
  ErrorException,
} from "@evmcrispr/sdk";
import type Eez from "..";
import {
  CROSS_CHAIN_FALLBACK_GAS,
  CROSS_CHAIN_OVERHEAD,
  computeProxy,
  createProxyAction,
  encodeExecuteBatch,
  estimateCallGas,
  interpretRemoteBlock,
  isDeployed,
  isProxyOn,
  remoteLabel,
  sumValues,
  supportsExecuteBatch,
} from "../utils/eez";

export default defineCommand<Eez>({
  name: "batch",
  description:
    "Run a block of commands on another EEZ chain as one atomic cross-chain call: every call the block produces executes over there from your own cross-chain proxy, in order, all or nothing. One sending-chain transaction, one cross-chain entry, however many calls. Helpers, conditions and loops inside evaluate on that chain.",
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
        "Commands whose calls execute on that chain, atomically (`exec`, `if`, `loop`, other modules' commands)",
    },
  ],
  opts: [
    {
      name: "gas",
      type: "number",
      description:
        "Gas limit for the whole batch, instead of the estimate from simulating it on the other chain",
    },
  ],
  async run(module, { chain, block }, { interpreters, opts }) {
    const { config, remote, targetChainId, rollupId, remoteSender, calls } =
      await interpretRemoteBlock(
        module,
        chain,
        block as BlockExpressionNode,
        interpreters,
        "eez:batch",
        { flattenBatches: true },
      );
    if (calls.length === 0) return [];
    for (const call of calls) {
      if (call.from) {
        throw new ErrorException(
          `--from cannot be used inside eez:batch: the whole batch runs from your proxy on ${chainLabel(targetChainId)}`,
        );
      }
      if (call.gas !== undefined) {
        throw new ErrorException(
          "--gas cannot be set on a command inside eez:batch: pass it to eez:batch itself",
        );
      }
    }

    // The batch is a message to yourself over there: your far-side proxy
    // runs the calls when it receives them from itself, which is what a
    // call to the proxy of that proxy becomes.
    const proxy = await computeProxy(module, config, remoteSender, rollupId);
    const creates: TransactionAction[] = (await isDeployed(module, proxy))
      ? []
      : [createProxyAction(config.registry, remoteSender, rollupId)];
    module.context.log(
      `Running ${calls.length} call${calls.length === 1 ? "" : "s"} on ${remoteLabel(config, rollupId)} as ${remoteSender} through proxy ${proxy}`,
    );

    const data = encodeExecuteBatch(calls);
    const value = sumValues(calls);
    // A far-side proxy nobody has called yet has no code: the manager
    // creates it on the way in. One that exists tells whether the proxies
    // over there know batches at all: an older proxy would forward the
    // batch as ordinary calldata, and the composer would evict the
    // transaction without a word.
    const farClient = await clientFor(module, targetChainId);
    const farCode = await farClient.getCode({ address: remoteSender });
    const farExists = !!farCode && farCode !== "0x";
    if (farExists && !supportsExecuteBatch(farCode)) {
      throw new ErrorException(
        `the cross-chain proxies on ${chainLabel(targetChainId)} do not support executeBatch yet: use batch ( eez:on … ) with a wallet that batches, or eez:on for independent calls`,
      );
    }
    let gas: bigint;
    if (opts.gas !== undefined) {
      gas = BigInt(opts.gas);
    } else {
      gas = farExists
        ? await estimateCallGas(
            module,
            config,
            rollupId,
            remoteSender,
            data,
            remoteSender,
            { failOnRevert: !interpreters.batchContext },
          )
        : CROSS_CHAIN_FALLBACK_GAS;
      // A call to a proxy over there (a nested `eez:on`) goes one hop
      // further; that leg cannot be simulated, so price this chain's
      // overhead on top, once per such call.
      for (const call of calls) {
        if (await isProxyOn(module, targetChainId, remote, call.to)) {
          gas += CROSS_CHAIN_OVERHEAD;
        }
      }
    }
    return [...creates, { to: proxy, data, value, gas }];
  },
});
