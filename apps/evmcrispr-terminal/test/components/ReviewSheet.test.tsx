import { describe, expect, it, mock } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { type ExecutionPhase, ReviewSheet } from "../../src/mobile/ReviewSheet";
import type { Approval, Review, Simulation } from "../../src/review/useReview";
import { testBrowser } from "../helpers/app";
import { renderInSpace } from "../setup/test-utils";

const ready: Simulation = {
  status: "ready",
  diagnostics: [],
  actions: [{ to: "0x000000000000000000000000000000000000dEaD", data: "0x01" }],
};
const idle: Simulation = { status: "idle", diagnostics: [] };

const reviewOf = (
  simulation: Simulation,
  over: Partial<Review> = {},
): Review => ({
  text: "print 1",
  unreviewed: false,
  unfetched: [],
  simulation,
  canExecute: simulation.status === "ready",
  validate: async () => {},
  simulate: async () => {},
  ...over,
});

/** A sheet on which the user asked to see the review of `text`. */
const asked = (text: string, over: Partial<Approval> = {}): Approval => ({
  shown: {
    text,
    unreviewed: true,
    nothingApproved: false,
    diff: [
      { kind: "removed", text: "print 1" },
      { kind: "added", text },
    ],
    revisions: [],
  },
  stale: false,
  armed: !over.stale,
  ask: () => {},
  approve: () => true,
  ...over,
});

const sheet = (
  phase: ExecutionPhase,
  state: Simulation,
  onCancel = () => {},
  heldRun?: React.ReactNode,
  over: Partial<Review> = {},
  onExecute: (shown: string) => void = () => {},
  approval = asked("print 1"),
) => (
  <ReviewSheet
    open
    onOpenChange={() => {}}
    review={reviewOf(state, over)}
    approval={approval}
    chainName="Gnosis"
    address="0x0000000000000000000000000000000000000001"
    executionPhase={phase}
    onExecute={onExecute}
    onConnect={() => {}}
    followingBoxes={2}
    errors={[]}
    executed={[]}
    onCancel={onCancel}
    heldRun={heldRun}
  />
);

/** The sheet reads the space on screen for its "what changed" section. */
async function render(ui: React.ReactNode) {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text: "print 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  const wrap = (node: React.ReactNode) => node;
  const rendered = renderInSpace(wrap(ui), { app, space });
  return { ...rendered, space };
}

describe("mobile review sheet run controls", () => {
  it("says the run follows boxes and offers to stop following", async () => {
    const onCancel = mock(() => {});
    await render(sheet("watching", ready, onCancel));
    const primary = screen.getByRole("button", {
      name: "Following 2 status boxes",
    }) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    expect(screen.queryByText(/Confirm 1 action/)).toBeNull();
    expect(screen.queryByText("Cancel execution")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop following" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps the cancel control when the review state reset mid-run", async () => {
    const onCancel = mock(() => {});
    const { rerender } = await render(sheet("running", idle, onCancel));
    fireEvent.click(screen.getByRole("button", { name: "Cancel execution" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(sheet("watching", idle, onCancel));
    fireEvent.click(screen.getByRole("button", { name: "Stop following" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("offers no cancel control once the run ended", async () => {
    await render(sheet("success", ready));
    expect(screen.queryByText("Cancel execution")).toBeNull();
    expect(screen.queryByText("Stop following")).toBeNull();
  });

  it("a paused run shows what it holds where Resume is, and offers no new confirmation", async () => {
    const paused = (heldRun?: React.ReactNode) =>
      sheet("paused", ready, () => {}, heldRun);
    const { rerender } = await render(paused());
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

  it("confirming asks for a run of the text the simulation shown was made of", async () => {
    const onExecute = mock((_shown: string) => {});
    await render(
      sheet(
        "idle",
        ready,
        () => {},
        undefined,
        { text: "exec shown" },
        onExecute,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm 1 action/ }));
    expect(onExecute).toHaveBeenCalledWith("exec shown");
  });

  it("with unreviewed changes it shows what changed with Approve, and offers no way to the wallet", async () => {
    const approve = mock(() => true);
    const over = { text: "exec 2", unreviewed: true, canExecute: false };
    await render(
      sheet(
        "idle",
        ready,
        () => {},
        undefined,
        over,
        () => {},
        asked("exec 2", { approve }),
      ),
    );
    const changed = screen.getByRole("region", { name: "What changed" });
    expect(changed.textContent).toContain("exec 2");
    expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Run script without simulation" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("a sheet that opened by itself shows no changes, no Approve and no simulation until the user asks for them", async () => {
    const ask = mock(() => {});
    const over = { text: "exec 2", unreviewed: true, canExecute: false };
    await render(
      sheet(
        "success",
        ready,
        () => {},
        undefined,
        over,
        () => {},
        asked("exec 2", { shown: null, ask }),
      ),
    );
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Changes" })).toBeNull();
    expect(screen.queryByText("Simulation passed")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Check & simulate" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the changes" }));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("when the script changed since the sheet's review was opened, the earlier changes stay, Approve is disabled and the new ones wait for a tap", async () => {
    const approve = mock(() => false);
    const ask = mock(() => {});
    const over = { text: "exec 3", unreviewed: true, canExecute: false };
    await render(
      sheet(
        "idle",
        ready,
        () => {},
        undefined,
        over,
        () => {},
        asked("exec 2", { stale: true, approve, ask }),
      ),
    );
    const changed = screen.getByRole("region", { name: "What changed" });
    expect(changed.textContent).toContain("exec 2");
    expect(changed.textContent).not.toContain("exec 3");
    expect(screen.getByRole("alert").textContent).toContain(
      "The script changed since this review was opened",
    );
    const button = screen.getByRole("button", {
      name: "Approve",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(approve).not.toHaveBeenCalled();
    expect(screen.queryByText("Simulation passed")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Show the new changes" }),
    );
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
