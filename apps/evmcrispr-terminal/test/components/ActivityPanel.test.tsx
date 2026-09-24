import { describe, expect, it } from "bun:test";
import type { ConsoleEntry } from "@evmcrispr/editor";
import type { BoxSnapshot } from "@evmcrispr/sdk";
import { render, screen } from "@testing-library/react";
import { ActivityPanel } from "../../src/components/mobile/TransactionReviewSheet";

const box = (over: Partial<BoxSnapshot> = {}): BoxSnapshot => ({
  id: "safe",
  state: "live",
  title: "Safe tx",
  detail: "1/2 confirmations",
  history: [],
  simulated: false,
  ...over,
});

const base = {
  errors: [],
  executed: [],
  rawActions: [],
};

describe("mobile activity panel", () => {
  it("says how many status boxes the run is following", () => {
    const { rerender } = render(
      <ActivityPanel {...base} phase="watching" logs={[]} followingBoxes={1} />,
    );
    expect(screen.getByText("Following 1 status box…")).toBeTruthy();
    rerender(
      <ActivityPanel {...base} phase="watching" logs={[]} followingBoxes={2} />,
    );
    expect(screen.getByText("Following 2 status boxes…")).toBeTruthy();
  });

  it("keeps plain logs and shows each box as one line", () => {
    const entries: ConsoleEntry[] = [
      { kind: "line", text: "hello" },
      {
        kind: "box",
        box: box({ id: "twap", title: "TWAP", detail: "Waiting" }),
      },
      { kind: "box", box: box() },
    ];
    render(
      <ActivityPanel
        {...base}
        phase="running"
        logs={["hello"]}
        entries={entries}
      />,
    );
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.getByText("Safe tx: 1/2 confirmations")).toBeTruthy();
    expect(screen.getByText("TWAP: Waiting")).toBeTruthy();
  });
  it("does not claim every action confirmed when a followed box failed", () => {
    const failed: ConsoleEntry[] = [
      { kind: "box", box: box() },
      {
        kind: "box",
        box: box({ id: "r", state: "failed", detail: "Replaced" }),
      },
    ];
    const { rerender } = render(
      <ActivityPanel {...base} phase="success" logs={[]} entries={[]} />,
    );
    expect(screen.getByText("All actions confirmed.")).toBeTruthy();
    rerender(
      <ActivityPanel {...base} phase="success" logs={[]} entries={failed} />,
    );
    expect(screen.queryByText("All actions confirmed.")).toBeNull();
    expect(
      screen.getByText("The script finished, but a status box failed."),
    ).toBeTruthy();
  });
});
