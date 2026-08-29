import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Eez from "..";
import {
  eezConfig,
  ensureProxy,
  estimateCallGas,
  remoteLabel,
} from "../utils/eez";

export default defineCommand<Eez>({
  name: "call",
  description:
    "Call a contract on another EEZ rollup synchronously from the current chain, through its cross-chain proxy: the call executes on the other side atomically with this transaction. Creates the proxy first if it does not exist yet and estimates the gas the composed call needs.",
  args: [
    {
      name: "target",
      type: "address",
      description: "Contract address on the other rollup",
    },
    {
      name: "signature",
      type: "write-abi",
      description: 'Function signature (e.g. `"setValue(uint256)"`)',
    },
    {
      name: "params",
      type: "any",
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  opts: [
    {
      name: "rollup",
      type: "number",
      description:
        "Rollup id the target lives on. Defaults to the other side of the current chain.",
    },
    {
      name: "value",
      type: "number",
      description: "ETH to send with the call (in wei)",
    },
    {
      name: "gas",
      type: "number",
      description:
        "Gas limit. By default the remote leg is simulated on the other chain and the protocol overhead added; set this if the call still runs out of gas or is evicted.",
    },
    {
      name: "from",
      type: "address",
      description: "Sender address (requires simulation or connected wallet)",
    },
  ],
  async run(module, { target, signature, params }, { opts }) {
    const config = await eezConfig(module);
    const { proxy, rollupId, actions } = await ensureProxy(
      module,
      config,
      target,
      opts.rollup,
    );

    const call = encodeAction(proxy, signature, params);
    if (opts.value !== undefined) call.value = BigInt(opts.value);
    if (opts.from) call.from = opts.from;
    call.gas =
      opts.gas !== undefined
        ? BigInt(opts.gas)
        : await estimateCallGas(
            module,
            config,
            rollupId,
            target,
            call.data ?? "0x",
            opts.from ?? (await module.getConnectedAccount()),
          );

    module.context.log(
      `Calling ${target} on ${remoteLabel(config, rollupId)} through proxy ${proxy}`,
    );
    return [...actions, call];
  },
});
