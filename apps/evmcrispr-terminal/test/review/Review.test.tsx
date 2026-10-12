import { afterEach, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { Review } from "../../src/review/Review";
import {
  askForReview,
  closeReview,
  surfaceNow,
} from "../../src/review/surface";
import type {
  Approval,
  Review as ReviewState,
  Simulation,
} from "../../src/review/useReview";
import { WalletContext } from "../../src/wallet/WalletContext";
import { testBrowser } from "../helpers/app";
import { renderInSpace } from "../setup/test-utils";

type Wallet = ComponentProps<typeof WalletContext.Provider>["value"];
const address = "0x0000000000000000000000000000000000000001" as const;

const ready: Simulation = {
  status: "ready",
  diagnostics: [],
  actions: [{ to: "0x000000000000000000000000000000000000dEaD", data: "0x01" }],
};
const idle: Simulation = { status: "idle", diagnostics: [] };

/** A review whose checks and simulations are counted, not made. */
function reviewOf(simulation: Simulation, over: Partial<ReviewState> = {}) {
  const validate = mock(async () => {});
  const simulate = mock(async () => {});
  const review: ReviewState = {
    text: "print 1",
    unreviewed: false,
    unfetched: [],
    simulation,
    canExecute: simulation.status === "ready",
    validate,
    simulate,
    ...over,
  };
  return { review, validate, simulate };
}

/** The user asked to see the review of `text`. */
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

async function open(
  review: ReviewState,
  {
    approval = asked("print 1"),
    wallet = { address, connectWallet: () => {} } as unknown as Wallet,
    sheet = false,
  }: { approval?: Approval; wallet?: Wallet; sheet?: boolean } = {},
) {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text: "print 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  const started: { mode: string; text?: string }[] = [];
  // Whether a run may start is the run manager's; here only what is
  // asked of it is looked at.
  app.runs.start = (async (_space: string, options: (typeof started)[0]) => {
    started.push(options);
    return { ok: true };
  }) as unknown as typeof app.runs.start;
  askForReview(space);
  const onRun = mock(() => {});
  renderInSpace(
    <WalletContext.Provider value={wallet}>
      <Review review={review} approval={approval} sheet={sheet} onRun={onRun} />
    </WalletContext.Provider>,
    { app, space },
  );
  return { started, onRun };
}

afterEach(closeReview);

for (const sheet of [false, true]) {
  const where = sheet ? "on a phone" : "on a desktop";

  test(`${where}, confirming asks for a run of the text the simulation was made of, then leads to the timeline`, async () => {
    const { review } = reviewOf(ready, { text: "print 2" });
    const { started, onRun } = await open(review, { sheet });
    expect(
      screen.getByRole("dialog", { name: "Review transactions" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm 1 action in wallet" }),
    );
    expect(started).toEqual([{ mode: "real", text: "print 2" }]);
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(surfaceNow().open).toBe(false);
  });

  test(`${where}, with unreviewed changes it shows what changed with Approve, and offers no way to the wallet`, async () => {
    const { review } = reviewOf(ready, { unreviewed: true, canExecute: false });
    const { started } = await open(review, {
      sheet,
      approval: asked("print 2"),
    });
    const dialog = screen.getByRole("dialog", { name: "Review changes" });
    expect(dialog.textContent).toContain("added: print 2");
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Run script without simulation" }),
    ).toBeNull();
    expect(started).toEqual([]);
  });
}

test("opening on an approved script simulates it; on unreviewed changes it only checks it", async () => {
  const approved = reviewOf(idle);
  await open(approved.review);
  expect(approved.simulate).toHaveBeenCalledTimes(1);
  expect(approved.validate).not.toHaveBeenCalled();

  const changed = reviewOf(idle, { unreviewed: true, canExecute: false });
  await open(changed.review);
  expect(changed.validate).toHaveBeenCalledTimes(1);
  expect(changed.simulate).not.toHaveBeenCalled();
});

test("an approved script that is already simulated is not simulated again on opening", async () => {
  const { review, simulate } = reviewOf(ready);
  await open(review);
  expect(simulate).not.toHaveBeenCalled();
});

test("before a simulation there is a way to run without one, and no confirmation of actions nobody saw", async () => {
  const { review } = reviewOf(idle);
  const { started, onRun } = await open(review);
  expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Run script without simulation" }),
  );
  expect(started).toEqual([{ mode: "real", text: "print 1" }]);
  expect(onRun).toHaveBeenCalledTimes(1);
});

test("a review that opened by itself shows no changes and no Approve, and checks and simulates nothing, until the user asks", async () => {
  const { review, validate, simulate } = reviewOf(idle, {
    unreviewed: true,
    canExecute: false,
  });
  await open(review, { approval: asked("print 2", { shown: null }) });
  expect(validate).not.toHaveBeenCalled();
  expect(simulate).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Simulate/ })).toBeNull();
  expect(screen.queryByRole("group", { name: "Changes" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.getByRole("button", { name: "Show the changes" })).toBeTruthy();
});

test("when the script changed since the review was opened, the earlier changes stay, Approve is disabled and nothing offers to simulate", async () => {
  const { review } = reviewOf(idle, { unreviewed: true, canExecute: false });
  await open(review, { approval: asked("print 2", { stale: true }) });
  expect(screen.queryByRole("button", { name: /Simulate/ })).toBeNull();
  expect(screen.getByRole("dialog").textContent).toContain("added: print 2");
  expect(
    (screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Show the new changes" }),
  ).toBeTruthy();
});

test("without a wallet it offers to connect one, and confirms nothing", async () => {
  const connectWallet = mock(() => {});
  const { review } = reviewOf(ready);
  const { started } = await open(review, {
    wallet: { address: undefined, connectWallet } as unknown as Wallet,
  });
  expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Connect wallet to continue" }),
  );
  expect(connectWallet).toHaveBeenCalledTimes(1);
  expect(started).toEqual([]);
  expect(surfaceNow().open).toBe(false);
});

test("without a wallet the summary says so, and names no address", async () => {
  const { review } = reviewOf(ready);
  await open(review, {
    wallet: {
      address: undefined,
      connectWallet: () => {},
    } as unknown as Wallet,
  });
  const text = screen.getByRole("dialog").textContent;
  expect(text).toContain("No wallet connected");
  expect(text).not.toContain("Created contract");
});
