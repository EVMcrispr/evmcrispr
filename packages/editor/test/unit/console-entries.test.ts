import { describe, expect, it } from "bun:test";
import type { BoxSnapshot } from "@evmcrispr/sdk";
import {
  consoleEntries,
  emptyConsole,
  reduceConsole,
} from "../../src/console/entries";

const snap = (over: Partial<BoxSnapshot>): BoxSnapshot => ({
  id: "b1",
  state: "live",
  title: "T",
  detail: "d",
  history: [],
  simulated: false,
  ...over,
});

describe("console entries", () => {
  it("keeps plain lines in order and drops box-tagged lines", () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "hello" });
    s = reduceConsole(s, { kind: "box", snapshot: snap({}) });
    s = reduceConsole(s, { kind: "line", text: "T: d", box: "b1" });
    s = reduceConsole(s, { kind: "line", text: "bye" });
    expect(
      consoleEntries(s).map((e) => (e.kind === "line" ? e.text : e.box.id)),
    ).toEqual(["hello", "b1", "bye"]);
  });

  it("keeps a box-tagged line as plain text when its box never arrived", () => {
    // Hosts that wire `onLog` but not `onBox` still see box updates.
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "Tx: Sent", box: "b9" });
    s = reduceConsole(s, { kind: "line", text: "Tx: Confirmed", box: "b9" });
    expect(
      consoleEntries(s).map((e) => (e.kind === "line" ? e.text : e.box.id)),
    ).toEqual(["Tx: Sent", "Tx: Confirmed"]);
  });

  it("updates a box in place", () => {
    let s = reduceConsole(emptyConsole, { kind: "box", snapshot: snap({}) });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ detail: "1/4", history: ["d"] }),
    });
    const [entry] = consoleEntries(s);
    expect(entry.kind === "box" && entry.box.detail).toBe("1/4");
  });

  it("keeps boxes flat, in the order they opened, whatever carries them", () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "first" });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "twap", title: "TWAP" }),
    });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "safe", title: "Safe tx" }),
    });
    // The TWAP learns its carrier: that orders endings, not the layout.
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "twap", title: "TWAP", parent: "safe" }),
    });
    expect(
      consoleEntries(s).map((e) => (e.kind === "line" ? e.text : e.box.id)),
    ).toEqual(["first", "twap", "safe"]);
  });

  it("counts live boxes", () => {
    let s = reduceConsole(emptyConsole, { kind: "box", snapshot: snap({}) });
    expect(s.live).toBe(1);
    s = reduceConsole(s, { kind: "box", snapshot: snap({ state: "done" }) });
    expect(s.live).toBe(0);
  });

  it("ends every live box when the run dies, keeping ended ones", () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "box", snapshot: snap({ id: "a" }) });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "b", state: "done", detail: "Executed" }),
    });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "c", simulated: true }),
    });
    s = reduceConsole(s, { kind: "end-live", detail: "Stopped following" });
    expect(s.live).toBe(0);
    expect(s.boxes.a).toMatchObject({
      state: "cancelled",
      detail: "Stopped following",
      history: ["d"],
    });
    expect(s.boxes.c.state).toBe("cancelled");
    expect(s.boxes.b).toMatchObject({ state: "done", detail: "Executed" });
    expect(s.slots).toHaveLength(3);
  });
});
