// A module that owns one kind of action, `ping`, for the module-action
// tests: `probe:ping <n>` makes one, and its `send` records what it got.
import type { Module, ModuleAction } from "@evmcrispr/sdk";
import { defineAction, defineCommand, defineModule } from "@evmcrispr/sdk";

export const PROBE_HASH = `0x${"01".repeat(32)}` as const;

/** Every action the probe's `send` was given, on this thread. */
export const probeSent: ModuleAction<{ n: bigint }>[] = [];

export const pingAction = defineAction<{ n: bigint }>("probe", "ping", {
  describe: (action) => ({
    title: `Ping ${action.data.n}`,
    detail: "a probe",
    meta: "probe",
    steps: [],
    notes: [],
  }),
  async send(action, ctx) {
    probeSent.push(action);
    ctx.onSent?.(PROBE_HASH);
    return { status: "success", transactionHash: PROBE_HASH, logs: [] };
  },
});

const ping = defineCommand<Module>({
  name: "ping",
  description: "Make a probe action.",
  args: [{ name: "n", type: "number", description: "A number" }],
  async run(module, { n }) {
    return [
      pingAction.create({
        chainId: await module.getChainId(),
        from: await module.getConnectedAccount(),
        data: { n: BigInt(n) },
      }),
    ];
  },
});

const load = <T>(value: T) => ({ load: async () => ({ default: value }) });

export class Probe extends defineModule("probe", { ping: load(ping) }, {}) {
  static readonly actions = { ping: pingAction };
}
