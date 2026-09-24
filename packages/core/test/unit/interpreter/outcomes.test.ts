import { describe, expect, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { RevertError } from "@evmcrispr/sdk";
import { classifyError } from "../../../src/interpreter/classify";
import { OutcomeRegistry } from "../../../src/interpreter/outcomes";

const tx = (to: string): Action => ({ to: to as `0x${string}`, data: "0x" });

describe("OutcomeRegistry", () => {
  it("settles a directly sent action", async () => {
    const r = new OutcomeRegistry();
    const a = tx("0x01");
    r.settle(a, { kind: "confirmed", receipt: 1 });
    expect(await r.outcomeOf([a])).toEqual({ kind: "confirmed", receipt: 1 });
  });

  it("resolves an inner action through its carrier chain", async () => {
    const r = new OutcomeRegistry();
    const inner = tx("0x01");
    const mid = tx("0x02");
    const outer = tx("0x03");
    r.link([inner], [mid]);
    r.link([mid], [outer]);
    const pending = r.outcomeOf([inner]);
    r.settle(outer, { kind: "rejected", reason: "User rejected" });
    expect(await pending).toEqual({
      kind: "rejected",
      reason: "User rejected",
    });
  });

  it("uses an explicit carry and its box", async () => {
    const r = new OutcomeRegistry();
    const inner = tx("0x01");
    r.carry(
      [inner],
      Promise.resolve({ kind: "replaced", reason: "nonce 4" }),
      "box-1",
    );
    expect(await r.outcomeOf([inner])).toEqual({
      kind: "replaced",
      reason: "nonce 4",
    });
    expect(r.carrierBox([inner])).toBe("box-1");
  });

  it("finds the nearest carrier box through links", () => {
    const r = new OutcomeRegistry();
    const inner = tx("0x01");
    const outer = tx("0x02");
    r.link([inner], [outer]);
    expect(r.carrierBox([inner])).toBeUndefined();
    r.attachBox(outer, "tx-1");
    expect(r.carrierBox([inner])).toBe("tx-1");
  });

  it("combines several actions: first failure wins, else confirmed", async () => {
    const r = new OutcomeRegistry();
    const [a, b] = [tx("0x01"), tx("0x02")];
    const both = r.outcomeOf([a, b]);
    r.settle(a, { kind: "confirmed" });
    r.settle(b, { kind: "reverted", reason: "boom" });
    expect(await both).toEqual({ kind: "reverted", reason: "boom" });
  });

  it("parents a sent action under its own box, else its carrier's", () => {
    const r = new OutcomeRegistry();
    const inner = tx("0x01");
    const outer = tx("0x02");
    r.link([inner], [outer]);
    r.attachBox(outer, "tx-1");
    expect(r.parentBox([outer])).toBe("tx-1");
    expect(r.parentBox([inner])).toBe("tx-1");
    expect(r.carrierBox([outer])).toBeUndefined();
  });

  it("never links an action to itself", async () => {
    const r = new OutcomeRegistry();
    const a = tx("0x01");
    r.link([a], [a]);
    r.attachBox(a, "tx-1");
    expect(r.carrierBox([a])).toBeUndefined();
    const pending = r.outcomeOf([a]);
    r.settle(a, { kind: "confirmed" });
    expect(await pending).toEqual({ kind: "confirmed" });
  });

  it("follows a shared ancestor to its carrier from every branch", async () => {
    const r = new OutcomeRegistry();
    const [i, x, y, z, w] = [
      tx("0x01"),
      tx("0x02"),
      tx("0x03"),
      tx("0x04"),
      tx("0x05"),
    ];
    r.link([i], [x, y]);
    r.link([x, y], [z]);
    r.link([z], [w]);
    const pending = r.outcomeOf([i]);
    r.settle(w, { kind: "confirmed", receipt: 1 });
    r.settleUnsent("Not sent");
    expect(await pending).toEqual({ kind: "confirmed", receipt: 1 });
  });

  it("settles everything still pending as not-sent", async () => {
    const r = new OutcomeRegistry();
    const a = tx("0x01");
    const pending = r.outcomeOf([a]);
    r.settleUnsent("Not sent");
    expect(await pending).toEqual({ kind: "not-sent", reason: "Not sent" });
  });

  it("settles each action once", async () => {
    const r = new OutcomeRegistry();
    const a = tx("0x01");
    r.settle(a, { kind: "confirmed" });
    r.settle(a, { kind: "failed", reason: "late" });
    expect(await r.outcomeOf([a])).toEqual({ kind: "confirmed" });
  });
});

describe("classifyError", () => {
  it("recognizes a wallet rejection anywhere in the cause chain", () => {
    const inner = new Error("User rejected the request.");
    inner.name = "UserRejectedRequestError";
    const outer = new Error("Transaction failed", { cause: inner });
    outer.name = "TransactionExecutionError";
    expect(classifyError(outer)).toEqual({
      kind: "rejected",
      reason: "Rejected in wallet",
    });
  });

  it("maps RevertError to reverted and anything else to failed", () => {
    expect(
      classifyError(new RevertError("Transaction reverted on-chain: 0x12"))
        .kind,
    ).toBe("reverted");
    expect(classifyError(new Error("RPC down"))).toEqual({
      kind: "failed",
      reason: "RPC down",
    });
  });
});
