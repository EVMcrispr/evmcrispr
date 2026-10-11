import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TransactionReviewState } from "../../src/hooks/useTransactionReview";
import {
  type ExecutionPhase,
  TransactionReviewSheet,
} from "../../src/mobile/TransactionReviewSheet";

const ready: TransactionReviewState = {
  status: "ready",
  diagnostics: [],
  actions: [],
  logs: [],
  fingerprint: "0x01",
};

const sheet = (
  phase: ExecutionPhase,
  state: TransactionReviewState,
  onCancel = () => {},
) => (
  <TransactionReviewSheet
    open
    onOpenChange={() => {}}
    state={state}
    actionCount={1}
    chainName="Gnosis"
    address="0x0000000000000000000000000000000000000001"
    executionPhase={phase}
    canExecute
    onPrepare={() => {}}
    onExecute={() => {}}
    onConnect={() => {}}
    logs={[]}
    followingBoxes={2}
    errors={[]}
    executed={[]}
    onCancel={onCancel}
  />
);

describe("mobile review sheet run controls", () => {
  it("says the run follows boxes and offers to stop following", () => {
    const onCancel = mock(() => {});
    render(sheet("watching", ready, onCancel));
    const primary = screen.getByRole("button", {
      name: "Following 2 status boxes",
    }) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    expect(screen.queryByText(/Confirm 1 action/)).toBeNull();
    expect(screen.queryByText("Cancel execution")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop following" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps the cancel control when the review state reset mid-run", () => {
    const onCancel = mock(() => {});
    const { rerender } = render(
      sheet("running", { status: "idle", diagnostics: [] }, onCancel),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel execution" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(sheet("watching", { status: "idle", diagnostics: [] }, onCancel));
    fireEvent.click(screen.getByRole("button", { name: "Stop following" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("offers no cancel control once the run ended", () => {
    render(sheet("success", ready));
    expect(screen.queryByText("Cancel execution")).toBeNull();
    expect(screen.queryByText("Stop following")).toBeNull();
  });

  it("a paused run shows what it holds where Resume is, and offers no new confirmation", () => {
    const paused = (heldRun?: React.ReactNode) => (
      <TransactionReviewSheet
        open
        onOpenChange={() => {}}
        state={ready}
        actionCount={1}
        chainName="Gnosis"
        address="0x0000000000000000000000000000000000000001"
        executionPhase="paused"
        canExecute
        onPrepare={() => {}}
        onExecute={() => {}}
        onConnect={() => {}}
        logs={[]}
        errors={[]}
        executed={[]}
        onCancel={() => {}}
        heldRun={heldRun}
      />
    );
    const { rerender } = render(paused());
    expect(screen.getByText("Run paused")).toBeTruthy();
    // The sheet has no Resume of its own.
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    rerender(paused(<p>the held action and its Resume</p>));
    expect(screen.getByText("the held action and its Resume")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cancel execution" }),
    ).toBeTruthy();
    const confirm = screen.getByRole("button", {
      name: /Confirm 1 action/,
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});
