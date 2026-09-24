import { describe, expect, it } from "bun:test";
import type { BoxSnapshot } from "@evmcrispr/sdk";

import { classifyError } from "../../../src/interpreter/classify";
import { deserializeError, serializeError } from "../../../src/worker/protocol";

describe("worker boxes", () => {
  it("box messages are cloneable", () => {
    const snapshot: BoxSnapshot = {
      id: "box-1",
      state: "live",
      title: "CoW TWAP 0x45…",
      detail: "1/4 executed",
      history: ["Waiting"],
      progress: [1, 4],
      links: { Order: "https://explorer.cow.fi/gc/orders/0x" },
      simulated: false,
    };
    expect(structuredClone({ kind: "box", id: "run", snapshot })).toEqual({
      kind: "box",
      id: "run",
      snapshot,
    });
  });

  it("a wallet rejection (EIP-1193 4001) still classifies as rejected across the boundary", () => {
    const raw = Object.assign(new Error("User denied transaction signature"), {
      code: 4001,
    });
    const wrapped = new Error("Transaction failed", { cause: raw });
    const revived = deserializeError(structuredClone(serializeError(wrapped)));
    expect(classifyError(revived)).toEqual({
      kind: "rejected",
      reason: "Rejected in wallet",
    });
  });
});
