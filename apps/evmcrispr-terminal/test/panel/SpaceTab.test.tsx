import { beforeEach, expect, test } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { applyText, isReviewed } from "@evmcrispr/space";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { setUi } from "../../src/app/ui-store";
import { SpaceTab } from "../../src/panel/space/SpaceTab";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { fakeEvml, type Step } from "../helpers/fake-evml";
import { settle } from "../helpers/tabs";
import { renderInSpace } from "../setup/test-utils";

const to = "0x000000000000000000000000000000000000dEaD" as const;
const tx = (n: number): Action => ({ to, data: `0x0${n}` });
const receipt = { status: "success", blockNumber: 1n };

const Address = () => (
  <output data-testid="address">{useLocation().pathname}</output>
);

/** A tab showing the Space tab for a space holding `text`. */
async function setup(
  text = "# Pay\nexec 1",
  steps: Step[] = [],
  wallet: Parameters<typeof fakeEvml>[1] = async () => receipt,
) {
  const browser = testBrowser();
  const evml = fakeEvml(steps, wallet);
  const app = browser.tab({
    evml: () => evml,
    wallet: async () => ({ client: evml.wallet, address: to }),
  });
  const id = await app.spaces.create({ text, source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  const render = () =>
    renderInSpace(
      <>
        <SpaceTab />
        <Address />
      </>,
      { app, space },
    );
  return { browser, app, evml, id, space, render };
}

beforeEach(() => setUi({ spaceView: "timeline", previewRevisionId: null }));

/** Picks an item of a row's or a card's "⋯" menu: the first one open. */
const more = async (item: string) => {
  await act(async () => {
    const [trigger] = screen.getAllByRole("button", { name: "More actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await settle();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: item }));
    await settle();
  });
};

test("lists spaces with their marks, opens one and removes one", async () => {
  const t = await setup();
  const other = await t.app.spaces.create({ text: "# Other", source: "user" });
  await t.app.storage.records.patchSpace(other, {
    unreviewed: true,
    run: "paused",
  });
  t.app.changes.announce({ store: "spaces", key: other });
  setUi({ spaceView: "list" });
  t.render();
  await act(settle);

  const list = screen.getByRole("list", { name: "Spaces" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  const row = rows.find((r) => r.textContent?.includes("Other"))!;
  expect(row.textContent).toContain("unreviewed");
  expect(row.textContent).toContain("run paused");

  fireEvent.click(within(row).getByRole("button", { name: /^Other/ }));
  expect(screen.getByTestId("address").textContent).toBe(`/${other}`);

  // Removing the space on screen goes to another one first.
  act(() => setUi({ spaceView: "list" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove Pay" }));
    await settle();
  });
  // Nothing goes before the user has said so, to a question that names it.
  expect(t.app.spaces.index.getState()).toHaveLength(2);
  const question = screen.getByRole("dialog");
  expect(question.textContent).toContain("“Pay”");
  await act(async () => {
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    await settle();
  });
  expect(t.app.spaces.index.getState()).toHaveLength(2);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Remove Pay" }));
    await settle();
  });
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove space",
      }),
    );
    await settle();
  });
  expect(screen.getByTestId("address").textContent).toBe(`/${other}`);
  expect(t.app.spaces.index.getState().map((meta) => meta.id)).toEqual([other]);
});

test("the search narrows the list", async () => {
  const t = await setup();
  await t.app.spaces.create({ text: "# Other", source: "user" });
  setUi({ spaceView: "list" });
  t.render();
  await act(settle);
  fireEvent.change(screen.getByLabelText("Search spaces"), {
    target: { value: "oth" },
  });
  expect(
    within(screen.getByRole("list", { name: "Spaces" })).getAllByRole(
      "listitem",
    ),
  ).toHaveLength(1);
});

test("shows a revision per assistant turn with its explanation, and collapses the user's", async () => {
  const t = await setup();
  for (const text of ["# Pay\nexec 2", "# Pay\nexec 3"]) {
    applyText(t.space.text, text, ORIGIN.user);
    t.space.record("user");
  }
  t.space.editAsTurn("t", { kind: "write", text: "# Pay\nexec 3\nexec 4" });
  t.space.endTurn("t", "Added the approval.");
  t.render();

  expect(screen.getByText("edited the script · 3 revisions")).toBeTruthy();
  const turn = screen.getByText("Added the approval.").closest("button")!;
  expect(turn.textContent).toContain("Assistant");
  expect(turn.textContent).toContain("+1");
  expect(turn.textContent).toContain("unreviewed");
});

test("Undo this change on an assistant's row goes back reviewed; Load in editor loads its revision without approving it", async () => {
  const t = await setup("# Pay\nexec 1");
  t.space.editAsTurn("t", { kind: "write", text: "# Pay\nexec evil" });
  t.space.endTurn("t", "Changed the target.");
  const reviewed = () =>
    isReviewed(t.space.getText(), t.space.markers.getState().approvedText);
  t.render();

  fireEvent.click(screen.getByText("Changed the target."));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Undo this change" })),
  );
  expect(t.space.getText()).toBe("# Pay\nexec 1");
  expect(reviewed()).toBe(true);
  expect(screen.getByText("reverted a change")).toBeTruthy();

  await more("Load in editor");
  expect(t.space.getText()).toBe("# Pay\nexec evil");
  expect(reviewed()).toBe(false);
});

test("Undo this change is offered only for what someone else wrote", async () => {
  const t = await setup();
  applyText(t.space.text, "# Pay\nexec 2", ORIGIN.user);
  t.space.record("user");
  t.space.editAsTurn("t", { kind: "write", text: "# Pay\nexec 3" });
  t.space.endTurn("t", "By the assistant.");
  t.render();
  fireEvent.click(screen.getByText("edited the script · 2 revisions"));
  for (const what of ["created the script", "edited the script"])
    fireEvent.click(screen.getByText(what));
  expect(screen.queryByRole("button", { name: "Undo this change" })).toBeNull();
  // Each open row has its menu, where Load in editor is.
  expect(screen.getAllByRole("button", { name: "More actions" }).length).toBe(
    2,
  );
  fireEvent.click(screen.getByText("By the assistant."));
  expect(
    screen.getAllByRole("button", { name: "Undo this change" }),
  ).toHaveLength(1);
});

test("View shows a revision without loading it", async () => {
  const t = await setup();
  t.render();
  fireEvent.click(screen.getByText("created the script"));
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  const { uiStore } = await import("../../src/app/ui-store");
  expect(uiStore.getState().previewRevisionId).toBeTruthy();
  expect(t.space.getText()).toBe("# Pay\nexec 1");
});

test("a run is a card, pinned while it runs, with Resume and Cancel when paused and Stop while it runs", async () => {
  let confirm!: (value: unknown) => void;
  const t = await setup(
    "print 1",
    [{ action: tx(1) }, { action: tx(2) }],
    () => new Promise((resolve) => (confirm = resolve)),
  );
  t.render();
  const started = await t.app.runs.start(t.id, { mode: "real" });
  if (!started.ok) throw new Error(started.reason);
  await act(settle);
  const pinned = () => screen.getByRole("list", { name: "Unfinished runs" });
  expect(
    within(pinned()).getByRole("button", { name: /^Run\s*Running/ }),
  ).toBeTruthy();

  // The user leaves; the prompt already open is confirmed; the next waits.
  await act(async () => {
    t.app.spaces.show("another-space");
    confirm(receipt);
    await settle();
  });
  act(() => t.app.spaces.show(t.id));
  const card = screen.getByRole("region", { name: "Run, Paused" });
  expect(card.textContent).toContain("Paused: you opened another space");
  expect(card.textContent).toContain("Contract call");
  expect(card.textContent).toContain(to);
  expect(
    within(pinned()).getByRole("button", { name: /^Run\s*Paused/ }),
  ).toBeTruthy();
  // The pinned row leads to the card; it has no Resume of its own.
  expect(within(pinned()).queryByRole("button", { name: "Resume" })).toBeNull();
  expect(t.evml.attempts).toBe(1);

  await act(async () => {
    fireEvent.click(within(card).getByRole("button", { name: "Resume" }));
    await settle();
  });
  expect(t.evml.attempts).toBe(2);
  expect(screen.getByRole("region", { name: "Run, Running" })).toBeTruthy();

  await act(async () => {
    fireEvent.click(within(pinned()).getByRole("button", { name: "Stop" }));
    await started.ended;
  });
  expect(screen.queryByRole("list", { name: "Unfinished runs" })).toBeNull();
  expect(screen.getByRole("region", { name: "Run, Cancelled" })).toBeTruthy();
});

test("a run of another tab is shown, without controls", async () => {
  const t = await setup(
    "print 1",
    [{ action: tx(1) }],
    () => new Promise(() => {}),
  );
  const started = await t.app.runs.start(t.id, { mode: "real" });
  if (!started.ok) throw new Error(started.reason);
  await settle();
  const other = t.browser.tab();
  const space = (await other.spaces.acquire(t.id))!;
  other.spaces.show(t.id);
  renderInSpace(<SpaceTab />, { app: other, space });
  const pinned = screen.getByRole("list", { name: "Unfinished runs" });
  expect(pinned.textContent).toContain("in another tab");
  expect(within(pinned).queryByRole("button", { name: "Cancel" })).toBeNull();
});

test("a finished run is a card that opens on its console; an earlier one is closed", async () => {
  const t = await setup("print 1", [{ log: "hello-from-run" }]);
  for (let i = 0; i < 2; i++) {
    const started = await t.app.runs.start(t.id, { mode: "real" });
    if (!started.ok) throw new Error(started.reason);
    await started.ended;
  }
  t.render();
  const cards = screen.getAllByRole("region", { name: "Run, Done" });
  expect(cards).toHaveLength(2);
  expect(cards[0].textContent).not.toContain("hello-from-run");
  expect(cards[1].textContent).toContain("hello-from-run");
  fireEvent.click(within(cards[0]).getByRole("button", { expanded: false }));
  expect(cards[0].textContent).toContain("hello-from-run");
  expect(
    within(cards[0]).getByRole("button", { name: "View script" }),
  ).toBeTruthy();
});

test("the filter chips narrow the rows", async () => {
  const t = await setup("print 1", [{ log: "x" }]);
  const started = await t.app.runs.start(t.id, { mode: "real" });
  if (!started.ok) throw new Error(started.reason);
  await started.ended;
  t.render();
  const rows = () =>
    within(screen.getByRole("list", { name: "Timeline" })).getAllByRole(
      "listitem",
    );
  expect(rows()).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Runs" }));
  expect(rows()).toHaveLength(1);
  expect(rows()[0].textContent).toContain("Run");
  fireEvent.click(screen.getByRole("button", { name: "Revisions" }));
  expect(rows()[0].textContent).toContain("created the script");
});

test("‹ Spaces goes to the list and counts runs paused in other spaces", async () => {
  const t = await setup();
  const other = await t.app.spaces.create({ text: "# Other", source: "user" });
  await t.app.storage.records.patchSpace(other, { run: "paused" });
  t.app.changes.announce({ store: "spaces", key: other });
  t.render();
  await act(settle);
  const back = screen.getByRole("button", { name: "Back to Spaces" });
  expect(
    screen.getByTitle("Runs paused in other spaces").textContent,
  ).toContain("1");
  fireEvent.click(back);
  expect(screen.getByRole("list", { name: "Spaces" })).toBeTruthy();
});

test("Undo this change on an assistant's row takes that change out and keeps what was typed after; when it cannot, Restore to before is offered", async () => {
  const t = await setup("# Pay\nexec 1\nexec 2");
  t.space.editAsTurn("t", { kind: "write", text: "# Pay\nexec evil\nexec 2" });
  t.space.endTurn("t", "Changed the target.");
  applyText(t.space.text, "# Pay\nexec evil\nexec 2\nexec 3", ORIGIN.user);
  t.render();
  fireEvent.click(screen.getByText("Changed the target."));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Undo this change" })),
  );
  expect(t.space.getText()).toBe("# Pay\nexec 1\nexec 2\nexec 3");
  expect(screen.getByText("reverted a change")).toBeTruthy();
  // Typing where the change was: it can no longer be taken out alone.
  act(() => void t.space.undo.undo());
  applyText(t.space.text, "# Pay\nexec mine\nexec 2\nexec 3", ORIGIN.user);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Undo this change" })),
  );
  expect(t.space.getText()).toBe("# Pay\nexec mine\nexec 2\nexec 3");
  expect(screen.getByRole("alert").textContent).toContain(
    "Later edits touch the same lines",
  );
  expect(
    screen.getByRole("button", { name: "Restore to before" }),
  ).toBeTruthy();
});

test("pressing the chosen filter again goes back to All", async () => {
  const t = await setup();
  t.render();
  const chip = (name: string) => screen.getByRole("button", { name });
  fireEvent.click(chip("Revisions"));
  expect(chip("Revisions")).toHaveAttribute("aria-pressed", "true");
  expect(chip("All")).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(chip("Revisions"));
  expect(chip("Revisions")).toHaveAttribute("aria-pressed", "false");
  expect(chip("All")).toHaveAttribute("aria-pressed", "true");
  // All itself stays on.
  fireEvent.click(chip("All"));
  expect(chip("All")).toHaveAttribute("aria-pressed", "true");
});
