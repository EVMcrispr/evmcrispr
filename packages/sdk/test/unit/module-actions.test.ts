import { describe, expect, it } from "bun:test";
import { defineAction, isModuleAction } from "../../src";

const A = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3" as const;

const ping = defineAction<{ n: bigint }>("probe", "ping", {
  describe: (action) => ({
    title: `ping ${action.data.n}`,
    detail: "d",
    meta: "m",
    steps: [],
    notes: [],
  }),
  send: async () => "sent",
});

describe("sdk > module actions", () => {
  it("create() makes a module action described by its module", () => {
    expect(ping.create({ chainId: 100, from: A, data: { n: 7n } })).toEqual({
      type: "module",
      module: "probe",
      kind: "ping",
      chainId: 100,
      from: A,
      data: { n: 7n },
      description: {
        title: "ping 7",
        detail: "d",
        meta: "m",
        steps: [],
        notes: [],
      },
    });
  });

  it("isModuleAction tells a module action from the others", () => {
    expect(
      isModuleAction(ping.create({ chainId: 100, from: A, data: { n: 1n } })),
    ).toBe(true);
    expect(
      isModuleAction({ type: "batched", chainId: 100, from: A, actions: [] }),
    ).toBe(false);
    expect(isModuleAction({ to: A, data: "0x" })).toBe(false);
  });
});
