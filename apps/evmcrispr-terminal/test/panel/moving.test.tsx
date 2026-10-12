import { afterEach, beforeEach, expect, test } from "bun:test";
import { decryptPayload, singleBlockCid } from "@evmcrispr/core";
import {
  applyText,
  head,
  isReviewed,
  orderedEntries,
  revisions,
  shareOf,
} from "@evmcrispr/space";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useLocation } from "react-router";
import { setUi } from "../../src/app/ui-store";
import { ScriptLoadState } from "../../src/components/terminal/ScriptLoadState";
import { SpaceTab } from "../../src/panel/space/SpaceTab";
import { surfaceNow } from "../../src/review/surface";
import { readExport, snapshotSpace } from "../../src/space/export";
import type { LiveSpace } from "../../src/space/live-space";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";
import { renderInSpace, renderWithApp } from "../setup/test-utils";

const Address = () => {
  const { pathname, hash } = useLocation();
  return <output data-testid="address">{pathname + hash}</output>;
};
const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);

// Pinata is never called: the page's fetch is answered here.
const realFetch = globalThis.fetch;
let pinned: any[] = [];
let copied: string[] = [];
// The address the pinning service gave each thing pinned.
let cids: string[] = [];
beforeEach(() => {
  setUi({ spaceView: "timeline", previewRevisionId: null, timelineSince: 0 });
  pinned = [];
  cids = [];
  copied = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    // Pinning goes through the API, which answers with the address of
    // what it was sent: the app checks that it is.
    if (!String(url).endsWith("/ipfs/pin"))
      throw new Error(`unexpected request to ${url}`);
    const content = JSON.parse(String(init.body)).pinataContent;
    pinned.push(content);
    const cid = await singleBlockCid(
      new TextEncoder().encode(JSON.stringify(content)),
    );
    cids.push(cid!);
    return new Response(JSON.stringify({ IpfsHash: cid }));
  }) as unknown as typeof fetch;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void copied.push(text) },
  });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function setup(text = "# Pay\nexec 1") {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text, source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  renderInSpace(
    <>
      <SpaceTab />
      <Address />
    </>,
    { app, space },
  );
  return { app, id, space };
}
const click = async (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
    await settle();
    await settle();
  });
const menu = async (item: string) => {
  await act(async () => {
    const trigger = screen.getByRole("button", { name: "Space menu" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await settle();
  });
  await click(screen.getByRole("menuitem", { name: item }));
};

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

test("sharing the script: its row reads shared, the row hands the same link back, and the address does not change", async () => {
  const { space } = await setup();
  const address = screen.getByTestId("address").textContent;
  const revision = head(space.timeline.getState())!;
  // A script is shared from the header; a row only gives its link back.
  await click(screen.getByRole("button", { name: "Share script" }));
  // Pinning hashes what it sends and what it is answered: not done in a
  // tick. The link being copied is the end of it.
  await waitFor(() => expect(copied).toHaveLength(1));
  expect(pinned).toHaveLength(1);
  expect(shareOf(space.timeline.getState(), revision.id)?.cid).toBe(cids[0]);
  expect(copied[0]).toMatch(new RegExp(`#/${cids[0]}#[\\w-]{43}$`));
  expect(screen.getByText("shared")).toBeDefined();
  await click(screen.getByText("created the script"));
  expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  await more("Copy link");
  await act(settle);
  expect(copied[1]).toBe(copied[0]);
  expect(pinned).toHaveLength(1);
  expect(screen.getByTestId("address").textContent).toBe(address);
});

test("Share on a script that is not approved shares nothing: it opens the review; its row offers no link", async () => {
  const { space } = await setup();
  act(() => {
    space.editAsTurn("t", { kind: "write", text: "# Pay\nexec 666" });
    space.endTurn("t", "Changed the amount.");
  });
  await click(screen.getByText("Changed the amount."));
  await act(async () => {
    const [trigger] = screen.getAllByRole("button", { name: "More actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await settle();
  });
  expect(screen.queryByRole("menuitem", { name: "Copy link" })).toBeNull();
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await settle();
  });
  await click(screen.getByRole("button", { name: "Share script" }));
  expect(pinned).toHaveLength(0);
  expect(surfaceNow().open).toBe(true);
  expect(surfaceNow().shown?.text).toBe("# Pay\nexec 666");
  expect(reviewed(space)).toBe(false);
});

test("Remove asks first, names the entry, and takes only it", async () => {
  const { space } = await setup();
  act(() => {
    applyText(space.text, "# Pay\nexec 2", ORIGIN.user);
    space.editAsTurn("t", { kind: "write", text: "# Pay\nsecret" });
    space.endTurn("t", "Pasted a secret.");
  });
  const before = revisions(space.timeline.getState()).length;
  await click(screen.getByText("Pasted a secret."));
  await more("Remove…");
  expect(revisions(space.timeline.getState())).toHaveLength(before);
  const question = screen.getByRole("dialog");
  expect(question.textContent).toContain("Pasted a secret.");
  // What it does not reach is said, with what can be counted.
  expect(question.textContent).toContain(
    "No other revision holds exactly this text",
  );
  expect(question.textContent).toContain(
    "The script on screen is this very text, and stays as it is",
  );
  expect(question.textContent).toContain(
    "Chats in which the assistant read the script keep what they read",
  );
  expect(question.textContent).toContain("cannot be recalled");
  expect(question.textContent).toContain("Clear timeline");
  await click(within(question).getByRole("button", { name: "Remove" }));
  expect(revisions(space.timeline.getState())).toHaveLength(before - 1);
  expect(
    revisions(space.timeline.getState()).some((r) => r.text.includes("secret")),
  ).toBe(false);
  expect(space.getText()).toBe("# Pay\nsecret");
  expect(reviewed(space)).toBe(false);
});

test("Clear and the previous entries; in the menu, Clear timeline asks, says what it cannot reach, and leaves one revision and a note", async () => {
  const { space } = await setup();
  act(() => {
    applyText(space.text, "# Pay\nexec 2", ORIGIN.user);
    space.record("user");
  });
  await click(screen.getByRole("button", { name: "Clear" }));
  expect(screen.getByText("Nothing here yet.")).toBeDefined();
  expect(revisions(space.timeline.getState())).toHaveLength(2);
  await click(screen.getByRole("button", { name: /previous entr/ }));
  expect(screen.queryByText("Nothing here yet.")).toBeNull();

  await menu("Clear timeline…");
  const question = screen.getByRole("dialog");
  expect(question.textContent).toContain(
    "Exports and share links made earlier still contain what they contained",
  );
  expect(revisions(space.timeline.getState())).toHaveLength(2);
  await click(within(question).getByRole("button", { name: "Clear timeline" }));
  const kinds = orderedEntries(space.timeline.getState()).map((e) => e.kind);
  expect(kinds.sort()).toEqual(["cleared", "revision"]);
  expect(screen.getByText(/You cleared the timeline/)).toBeDefined();
  expect(space.getText()).toBe("# Pay\nexec 2");
  expect(reviewed(space)).toBe(true);
});

test("Export: the dialog says the link gives permanent access to everything, pins an encrypted space, and leaves the address alone", async () => {
  const { id, space } = await setup();
  const address = screen.getByTestId("address").textContent;
  await menu("Export space…");
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain(
    "Anyone who gets the link can read all of it, permanently",
  );
  expect(dialog.textContent).toContain("chats with the assistant are not");
  expect(pinned).toHaveLength(0);
  await click(within(dialog).getByRole("button", { name: "Create link" }));
  // As above: the link is there when the pinning is done.
  const url = (
    (await within(dialog).findByLabelText(
      "Link to the exported space",
    )) as HTMLInputElement
  ).value;
  expect(pinned).toHaveLength(1);
  const [, cid, key] = url.match(/#\/(\w+)#([\w-]+)$/) ?? [];
  expect(cid).toBe(cids[0]);
  expect(await decryptPayload(pinned[0], key)).toMatchObject({
    kind: "space",
    id,
    script: space.getText(),
  });
  expect(screen.getByTestId("address").textContent).toBe(address);
});

test("an export link asks before anything: restore where the space is not, and the first thing on screen is its script", async () => {
  const source = testBrowser().tab();
  const sid = await source.spaces.create({
    text: "# Pay\nexec 1",
    source: "user",
  });
  const exported = readExport(
    JSON.parse(
      JSON.stringify(snapshotSpace((await source.spaces.acquire(sid))!)),
    ),
    "QmLink",
  );
  const app = testBrowser().tab();
  renderWithApp(
    <>
      <ScriptLoadState route={{ status: "export", exported }} />
      <Address />
    </>,
    { app },
  );
  expect(screen.getByText(/This link holds a whole space/)).toBeDefined();
  expect(app.spaces.index.getState()).toEqual([]);
  expect(pinned).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /Merge/ })).toBeNull();
  await click(screen.getByRole("button", { name: "Restore" }));
  expect(screen.getByTestId("address").textContent).toBe(`/${sid}`);
  const restored = (await app.spaces.acquire(sid))!;
  expect(restored.getText()).toBe("# Pay\nexec 1");
  expect(reviewed(restored)).toBe(true);
});

test("an export link into a space that is here says so, by name, and merges only on Merge", async () => {
  const app = testBrowser().tab();
  const id = await app.spaces.create({
    text: "# Mine\nexec 1",
    source: "user",
  });
  const space = (await app.spaces.acquire(id))!;
  const exported = readExport(
    {
      kind: "space",
      id,
      title: "",
      script: "# Theirs\nexec 666",
      timeline: {},
    },
    "QmLink",
  );
  renderWithApp(
    <>
      <ScriptLoadState route={{ status: "export", exported }} />
      <Address />
    </>,
    { app },
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "goes into a space you already have: “Mine”",
  );
  expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  await settle();
  expect(space.getText()).toBe("# Mine\nexec 1");
  await click(screen.getByRole("button", { name: "Merge into “Mine”" }));
  expect(space.getText()).toBe("# Theirs\nexec 666");
  expect(reviewed(space)).toBe(false);
  expect(screen.getByTestId("address").textContent).toBe(`/${id}`);
});

test("Open as copy makes another space and leaves the one here alone; Cancel makes nothing", async () => {
  const app = testBrowser().tab();
  const id = await app.spaces.create({
    text: "# Mine\nexec 1",
    source: "user",
  });
  const exported = readExport(
    {
      kind: "space",
      id,
      title: "",
      script: "# Theirs\nexec 666",
      timeline: {},
    },
    "QmLink",
  );
  const view = renderWithApp(
    <>
      <ScriptLoadState route={{ status: "export", exported }} />
      <Address />
    </>,
    { app },
  );
  await click(screen.getByRole("button", { name: "Cancel" }));
  expect(app.spaces.index.getState()).toHaveLength(1);
  expect(screen.getByTestId("address").textContent).toBe(`/${id}`);
  view.unmount();
  renderWithApp(
    <>
      <ScriptLoadState route={{ status: "export", exported }} />
      <Address />
    </>,
    { app },
  );
  await click(screen.getByRole("button", { name: "Open as copy" }));
  expect(app.spaces.index.getState()).toHaveLength(2);
  const copy = screen.getByTestId("address").textContent!.slice(1);
  expect(copy).not.toBe(id);
  expect((await app.spaces.acquire(copy))!.getText()).toBe(
    "# Theirs\nexec 666",
  );
  expect((await app.spaces.acquire(id))!.getText()).toBe("# Mine\nexec 1");
});

test("a refused export says why and offers nothing to restore", () => {
  const app = testBrowser().tab();
  renderWithApp(
    <ScriptLoadState
      route={{ status: "refused", why: "its script is too long" }}
    />,
    { app },
  );
  expect(screen.getByText(/The reason: its script is too long/)).toBeDefined();
  expect(
    screen.queryByRole("button", { name: /Restore|Merge|copy/ }),
  ).toBeNull();
});

test("the Remove dialog counts the other revisions that hold the same text, and the runs of it", async () => {
  const { space } = await setup("exec SECRET");
  const first = head(space.timeline.getState())!;
  act(() => {
    applyText(space.text, "exec 2", ORIGIN.user);
    space.record("user");
    // The same text again, as another revision.
    applyText(space.text, "exec SECRET", ORIGIN.user);
    space.record("user");
    space.commit({
      runs: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          revisionId: first.id,
          mode: "simulated",
          status: "success",
          startedAt: 1,
          by: { kind: "user" },
          console: { slots: [], boxes: {}, live: 0 },
          errors: [],
          output: "",
          executedCount: 0,
          updatedAt: 1,
        },
      ],
    });
  });
  await click(
    screen.getByText(/edited the script · 3 revisions|created the script/),
  );
  const rows = screen.getAllByText("created the script");
  await click(rows[0]);
  await more("Remove…");
  const text = screen.getByRole("dialog").textContent;
  expect(text).toContain("1 other revision holds exactly this text and stays");
  expect(text).toContain("1 run of this text keeps what it printed");
});
