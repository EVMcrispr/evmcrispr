import { beforeEach, expect, test } from "bun:test";
import type { EvmlTag } from "@evmcrispr/core";
import { EvmcrisprProvider } from "@evmcrispr/editor";
import type { Action } from "@evmcrispr/sdk";
import { applyText, head, isReviewed } from "@evmcrispr/space";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { setUi } from "../../src/app/ui-store";
import { ExecuteButton } from "../../src/components/execution/ExecuteButton";
import ShareScriptButton from "../../src/components/scripts/ShareScriptButton";
import { ReviewDialog } from "../../src/review/ReviewDialog";
import { closeReview, showReview, surfaceNow } from "../../src/review/surface";
import type { LiveSpace } from "../../src/space/live-space";
import { ORIGIN } from "../../src/space/undo";
import { WalletContext } from "../../src/wallet/WalletContext";
import { testBrowser } from "../helpers/app";
import { fakeEvml } from "../helpers/fake-evml";
import { settle } from "../helpers/tabs";
import { renderInSpace } from "../setup/test-utils";

const to = "0x000000000000000000000000000000000000dEaD" as const;
const tx: Action = { to, data: "0xa9059cbb" };
const wallet = { address: to } as unknown as ComponentProps<
  typeof WalletContext.Provider
>["value"];

/** Checks a script without the interpreter: `exec` lines are errors. */
const tag = {
  script: (source: string) => ({
    validate: async () =>
      source.includes("exec")
        ? {
            valid: false,
            diagnostics: [
              { line: 1, col: 0, severity: "error", message: "bad exec" },
            ],
          }
        : { valid: true, diagnostics: [] },
  }),
} as unknown as EvmlTag;
const Host = ({ children }: { children: ReactNode }) => (
  <EvmcrisprProvider evml={tag}>
    <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>
  </EvmcrisprProvider>
);

const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);
const turn = (space: LiveSpace, id: string, text: string, summary?: string) => {
  space.editAsTurn(id, { kind: "write", text });
  return space.endTurn(id, summary)!;
};
const names = () =>
  screen.getAllByRole("button").map((button) => button.textContent);
/** Clicks, and waits for the review's check and simulation to be over. */
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await settle();
  });
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  // Approve takes a click only once what it approves has been on screen
  // a moment.
  await waitFor(() => {
    const approve = screen.queryByRole("button", { name: "Approve" });
    if (approve && !screen.queryByText(/changed since this review/))
      expect((approve as HTMLButtonElement).disabled).toBe(false);
  });
};

async function setup(init: { text?: string; unreviewed?: true } = {}) {
  const browser = testBrowser();
  const evml = fakeEvml([{ line: 1 }], async () => ({}), {
    simulation: { actions: [tx] },
  });
  const app = browser.tab({
    evml: () => evml,
    wallet: async () => ({ client: evml.wallet, address: to }),
  });
  const id = await app.spaces.create({
    text: init.text ?? "print 1\nprint 2",
    source: init.unreviewed ? "import" : "user",
    ...(init.unreviewed ? { unreviewed: true as const } : {}),
  });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  const render = () =>
    renderInSpace(
      <Host>
        <ShareScriptButton />
        <ExecuteButton />
        <ReviewDialog />
      </Host>,
      { app, space },
    );
  const runsOf = (mode: "real" | "simulated") =>
    [...space.timeline.getState().runs.values()].filter((r) => r.mode === mode);
  return { browser, app, evml, id, space, render, runsOf };
}

beforeEach(() => {
  closeReview();
  setUi({ activeTab: "space" });
});

test("an assistant edit turns Run into Review changes; the review shows the diff, the revision with its explanation and the simulated actions; Approve restores Run", async () => {
  const t = await setup();
  t.render();
  expect(names()).toContain("Run");
  act(() => void turn(t.space, "t1", "print 1\nprint 666", "Pays the grant"));
  expect(names()).not.toContain("Run");
  await click("Review changes");

  const dialog = screen.getByRole("dialog");
  const changes = within(dialog).getByRole("group", { name: "Changes" });
  expect(changes.textContent).toContain("removed: print 2");
  expect(changes.textContent).toContain("added: print 666");
  const recorded = within(dialog).getByRole("list", {
    name: "Recorded changes",
  });
  expect(recorded.textContent).toContain("Assistant Pays the grant");
  expect(
    within(recorded).getByLabelText("1 lines added, 1 removed"),
  ).toBeTruthy();
  // Opening the review ran nothing: no run, and the worker was not given
  // the script. The check, which only reads it, was made.
  expect(t.evml.source).toBe("");
  expect(t.runsOf("simulated")).toHaveLength(0);
  expect(within(dialog).queryByRole("list", { name: "Actions" })).toBeNull();
  // Simulating text nobody approved is said to run it.
  expect(dialog.textContent).toContain(
    "They can make web requests and load modules",
  );
  // The simulation is asked for: a simulated run of the space, of the
  // text shown.
  await click("Simulate");
  expect(t.evml.source).toBe("print 1\nprint 666");
  expect(t.runsOf("simulated")).toHaveLength(1);
  const actions = within(dialog).getByRole("list", { name: "Actions" });
  expect(actions.textContent).toContain(to);

  await click("Approve");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(reviewed(t.space)).toBe(true);
  expect(names()).toContain("Run");
  // A further assistant edit blocks again.
  act(() => void turn(t.space, "t2", "print 1\nprint 667"));
  expect(names()).toContain("Review changes");
  expect(names()).not.toContain("Run");
});

test("an edit landing while the review is open leaves the earlier diff on screen with Approve disabled; the new changes are shown, and can be approved, only when asked for", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "print 1\nprint 22"));
  await click("Review changes");
  const approve = () =>
    screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
  const changes = () =>
    within(screen.getByRole("dialog")).getByRole("group", { name: "Changes" })
      .textContent;
  expect(approve().disabled).toBe(false);
  // The assistant writes again while the user is reading.
  act(() => void turn(t.space, "t2", "print 1\nprint 666"));
  // What they were reading is still what is on screen.
  expect(changes()).toContain("added: print 22");
  expect(changes()).not.toContain("print 666");
  expect(
    within(screen.getByRole("dialog")).getByRole("alert").textContent,
  ).toContain("The script changed since this review was opened");
  expect(approve().disabled).toBe(true);
  fireEvent.click(approve());
  expect(reviewed(t.space)).toBe(false);
  expect(t.space.markers.getState().approvedText).toBe("print 1\nprint 2");
  // Nothing is checked or simulated beside a text that moved on.
  expect(screen.queryByRole("button", { name: /Simulate/ })).toBeNull();

  await click("Show the new changes");
  // Being shown the new version runs nothing either.
  expect(t.evml.source).toBe("");
  expect(changes()).toContain("added: print 666");
  expect(changes()).not.toContain("print 22");
  expect(approve().disabled).toBe(false);
  await click("Approve");
  expect(t.space.markers.getState().approvedText).toBe("print 1\nprint 666");
});

test("the approval is of the displayed text even when called with nothing rendered in between", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "print 1\nprint 22"));
  await click("Review changes");
  const approve = screen.getByRole("button", { name: "Approve" });
  // No render between the change and the click: the handler still holds
  // the text it was rendered with, and the space refuses it.
  t.space.editAsTurn("t2", { kind: "write", text: "print 1\nprint 666" });
  approve.click();
  expect(reviewed(t.space)).toBe(false);
  expect(t.space.markers.getState().approvedText).toBe("print 1\nprint 2");
  await act(settle);
});

test("a space with nothing approved shows the whole script as changed, and Approve works", async () => {
  const t = await setup({ text: "print 7\nprint 8", unreviewed: true });
  t.render();
  await click("Review changes");
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("Nothing of this script is approved");
  const changes = within(dialog).getByRole("group", { name: "Changes" });
  expect(changes.textContent).toBe("+added: print 7+added: print 8");
  await click("Approve");
  expect(reviewed(t.space)).toBe(true);
  expect(names()).toContain("Run");
});

test("Approve is allowed when the simulation fails, and does not wait for it", async () => {
  const browser = testBrowser();
  const evml = fakeEvml([], async () => ({}), {
    simulation: { success: false, error: "reverted: no funds" },
  });
  const app = browser.tab({ evml: () => evml });
  const id = await app.spaces.create({ text: "print 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  renderInSpace(
    <Host>
      <ExecuteButton />
      <ReviewDialog />
    </Host>,
    { app, space },
  );
  act(() => void turn(space, "t1", "print 22"));
  await click("Review changes");
  await click("Simulate");
  expect(screen.getByRole("dialog").textContent).toContain(
    "reverted: no funds",
  );
  await click("Approve");
  expect(reviewed(space)).toBe(true);
});

test("a script that does not validate is still shown and can be approved", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "exec 2"));
  await click("Review changes");
  expect(screen.getByRole("dialog").textContent).toContain(
    "Fix the validation errors before simulating.",
  );
  expect(t.runsOf("simulated")).toHaveLength(0);
  // The check was made on opening, unasked: it executes nothing.
  expect(screen.getByRole("dialog").textContent).toContain("bad exec");
  expect(t.evml.source).toBe("");
  await click("Approve");
  expect(reviewed(t.space)).toBe(true);
});

test("Revert in the review takes one change out and keeps later typing; an overlapping one is refused and Restore is offered", async () => {
  const t = await setup({ text: "print 1\nprint 2\nprint 3" });
  t.render();
  let change = turn(t.space, "t1", "print 1\nprint 22\nprint 3", "Shouts b");
  act(
    () =>
      void applyText(
        t.space.text,
        "print 1\nprint 22\nprint 3\nprint 4",
        ORIGIN.user,
      ),
  );
  await click("Review changes");
  await click("Undo this change");
  expect(t.space.getText()).toBe("print 1\nprint 2\nprint 3\nprint 4");
  expect(head(t.space.timeline.getState())).toMatchObject({
    source: "revert",
    from: change.id,
  });
  // What is left was never approved: the review stays, on the new text,
  // without the "script changed" notice of someone else's edit.
  expect(reviewed(t.space)).toBe(false);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  // Ctrl+Z brings the change back, unreviewed.
  act(() => void t.space.undo.undo());
  expect(t.space.getText()).toBe("print 1\nprint 22\nprint 3\nprint 4");
  expect(reviewed(t.space)).toBe(false);

  act(
    () =>
      void applyText(
        t.space.text,
        "print 1\nprint 9\nprint 3\nprint 4",
        ORIGIN.user,
      ),
  );
  change = head(t.space.timeline.getState())!;
  await click("Show the new changes");
  // The assistant's change is the first listed; the typed line overlaps it.
  const [revert] = screen.getAllByRole("button", {
    name: "Undo this change",
  });
  await act(async () => void fireEvent.click(revert));
  expect(t.space.getText()).toBe("print 1\nprint 9\nprint 3\nprint 4");
  expect(screen.getByRole("alert").textContent).toContain(
    "Later edits touch the same lines",
  );
  const [restore] = screen.getAllByRole("button", {
    name: "Restore to before",
  });
  await act(async () => void fireEvent.click(restore));
  expect(t.space.getText()).toBe("print 1\nprint 2\nprint 3");
  expect(reviewed(t.space)).toBe(true);
  // Nothing is left to approve: the review is of what the script would
  // send, as for any approved script.
  const dialog = screen.getByRole("dialog", { name: "Review transactions" });
  expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
});

test("Share leads to the review while unreviewed, and pins nothing", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "print 666"));
  await click("Share script");
  expect(surfaceNow().open).toBe(true);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

test("a real run asked for from anywhere is refused and opens the review; a simulation is not", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "print 666"));
  expect(await t.app.runs.start(t.id, { mode: "real" })).toEqual({
    ok: false,
    reason: "unreviewed",
  });
  expect(t.runsOf("real")).toHaveLength(0);
  await click("Review changes");
  expect(t.runsOf("simulated")).toHaveLength(0);
  await click("Simulate");
  expect(t.runsOf("simulated")).toHaveLength(1);
});

test("approving in one tab closes the gate's mark in the other", async () => {
  const t = await setup();
  const other = t.browser.tab();
  const there = (await other.spaces.acquire(t.id))!;
  other.spaces.show(t.id);
  renderInSpace(
    <Host>
      <ExecuteButton />
    </Host>,
    { app: other, space: there },
  );
  turn(t.space, "t1", "print 22");
  await act(settle);
  expect(names()).toEqual(["Review changes"]);
  t.space.approve("print 22");
  await act(settle);
  expect(names()).toEqual(["Simulate", "Run"]);
});

test("Approve is not live the instant the review appears, nor right after new changes are shown, and never has the focus", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "print 1\nprint 22"));
  // A double click on the button that opens the review: the second click
  // lands where the dialog now is.
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  const approve = () =>
    screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
  expect(approve().disabled).toBe(true);
  fireEvent.click(approve());
  expect(reviewed(t.space)).toBe(false);
  expect(document.activeElement).not.toBe(approve());
  await waitFor(() => expect(approve().disabled).toBe(false));
  expect(document.activeElement).not.toBe(approve());

  act(() => void turn(t.space, "t2", "print 1\nprint 666"));
  fireEvent.click(screen.getByRole("button", { name: "Show the new changes" }));
  expect(approve().disabled).toBe(true);
  fireEvent.click(approve());
  expect(reviewed(t.space)).toBe(false);
  await waitFor(() => expect(approve().disabled).toBe(false));
  await act(settle);
});

test("an approval that fails approves nothing, keeps the review open and says so", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "print 1\nprint 22"));
  await click("Review changes");
  const approve = t.space.approve;
  (t.space as { approve: unknown }).approve = () => {
    throw new Error("storage is gone");
  };
  await click("Approve");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(reviewed(t.space)).toBe(false);
  expect(
    within(screen.getByRole("dialog")).getByRole("alert").textContent,
  ).toContain("Nothing was approved");
  (t.space as { approve: unknown }).approve = approve;
});

test("a review that something other than the user's asking opened shows no changes and no Approve until they ask", async () => {
  const t = await setup();
  t.render();
  act(() => void turn(t.space, "t1", "print 1\nprint 22"));
  act(showReview);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
  expect(within(dialog).queryByRole("group", { name: "Changes" })).toBeNull();
  await click("Show the changes");
  expect(
    within(screen.getByRole("dialog")).getByRole("group", { name: "Changes" })
      .textContent,
  ).toContain("added: print 22");
  await click("Approve");
  expect(reviewed(t.space)).toBe(true);
});

test("checking an unreviewed script fetches no module it names and says which were left unchecked; once approved the check fetches as before", async () => {
  const asked: { source: string; remoteModules: boolean | undefined }[] = [];
  const recording = {
    script: (source: string) => ({
      validate: async (options: { remoteModules?: boolean } = {}) => {
        asked.push({ source, remoteModules: options.remoteModules });
        return {
          valid: true,
          diagnostics: [],
          unfetched: options.remoteModules === false ? ["lib"] : [],
        };
      },
    }),
  } as unknown as EvmlTag;
  const t = await setup();
  const { useReview } = await import("../../src/review/useReview");
  const Check = () => {
    const review = useReview();
    return (
      <button type="button" onClick={() => void review.validate()}>
        check
      </button>
    );
  };
  renderInSpace(
    <EvmcrisprProvider evml={recording}>
      <WalletContext.Provider value={wallet}>
        <ExecuteButton />
        <ReviewDialog />
        <Check />
      </WalletContext.Provider>
    </EvmcrisprProvider>,
    t,
  );
  const script = 'load lib --from "ipfs://bafy"\nlib:pay 1';
  act(() => void turn(t.space, "t1", script));
  await click("Review changes");
  expect(asked).toEqual([{ source: script, remoteModules: false }]);
  expect(screen.getByRole("dialog").textContent).toContain(
    'The module "lib" is loaded from elsewhere. It was not fetched and its commands were not checked',
  );
  await click("Approve");
  await click("check");
  expect(asked.at(-1)).toEqual({ source: script, remoteModules: true });
});
