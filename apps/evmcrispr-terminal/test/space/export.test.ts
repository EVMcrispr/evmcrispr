import { describe, expect, test } from "bun:test";
import {
  decryptPayload,
  encryptPayload,
  type SharePayload,
  SPACE_MIN_VERSION,
} from "@evmcrispr/core";
import { resolveModuleSource } from "@evmcrispr/sdk";
import {
  applyText,
  head,
  IMPORT_LIMITS,
  isReviewed,
  orderedEntries,
  revisionId,
  revisions,
} from "@evmcrispr/space";
import { restoreBefore } from "../../src/review/undo-revision";
import {
  exportSpace,
  readExport,
  restoreSpace,
  type SpaceExport,
  snapshotSpace,
} from "../../src/space/export";
import type { LiveSpace } from "../../src/space/live-space";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";

type SpacePayload = Extract<SharePayload, { kind: "space" }>;

const me = { kind: "user" } as const;
const reviewed = (space: LiveSpace) =>
  isReviewed(space.getText(), space.markers.getState().approvedText);
const type = (space: LiveSpace, text: string) =>
  applyText(space.text, text, ORIGIN.user);
const emptyConsole = { slots: [], boxes: {}, live: 0 };
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const R1 = uuid(1);
const run = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  revisionId: "",
  mode: "real" as const,
  status: "success" as const,
  startedAt: 5,
  by: me,
  console: emptyConsole,
  errors: [],
  output: "",
  executedCount: 0,
  updatedAt: 5,
  ...extra,
});
const runEntry = (id: string) =>
  ({ kind: "run", id, runId: id, ts: 5, author: me }) as const;

/** What a link carries: the payload as JSON, as after decrypting it. */
const overTheWire = (payload: SpacePayload): SpacePayload =>
  JSON.parse(JSON.stringify(payload));
const exportOf = (space: LiveSpace): SpaceExport =>
  readExport(overTheWire(snapshotSpace(space)), "QmCid");

/** A space with two revisions, a run and private marks. */
async function written(app = testBrowser().tab()) {
  const id = await app.spaces.create({ text: "# Pay\nexec 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  type(space, "# Pay\nexec 2");
  space.record("user");
  space.commit({ runs: [run(R1)], entries: [runEntry(R1)] });
  await space.setMarkers({ hiddenBefore: 3, revisionChats: { x: "chat-1" } });
  return { app, id, space };
}

/** A payload an attacker writes: any script, any timeline, anything else. */
function crafted(
  id: string,
  script: string,
  timeline: unknown,
  extra: Record<string, unknown> = {},
): SpacePayload {
  return { kind: "space", id, title: "", script, timeline, ...extra };
}
const revision = (text: string, parent?: string, extra = {}) => ({
  kind: "revision",
  id: revisionId(text, parent),
  ts: 1,
  author: me,
  text,
  source: "user",
  ...(parent ? { parent } : {}),
  ...extra,
});

describe("an export", () => {
  test("holds the id, the document and the timeline, and nothing private", async () => {
    const { app, id, space } = await written();
    await app.chats.ready;
    // A link made here stays here: its entry holds the link's key.
    space.commit({
      entries: [
        {
          kind: "share",
          id: uuid(9),
          ts: 1,
          author: me,
          revisionId: head(space.timeline.getState())!.id,
          cid: "QmZYrSACX7w6DbPg2SRJ4JrKkZpHbg86mqQ27xvChTCRry",
          key: "K".repeat(43),
        },
      ],
    });
    const payload = snapshotSpace(space);
    expect(JSON.stringify(payload.timeline)).not.toContain('"share"');
    expect(JSON.stringify(payload)).not.toContain("K".repeat(43));
    expect(Object.keys(payload).sort()).toEqual([
      "id",
      "kind",
      "script",
      "timeline",
      "title",
    ]);
    expect(payload.id).toBe(id);
    expect(payload.script).toBe("# Pay\nexec 2");
    expect(payload.title).toBe("Pay");
    const json = JSON.stringify(payload);
    for (const secret of [
      "chat-1",
      "approvedText",
      "hiddenBefore",
      "revisionChats",
      "turnPending",
    ])
      expect(json).not.toContain(secret);
  });

  test("is pinned encrypted, stamped with the version that reads it, and never blocked by the review", async () => {
    const { space } = await written();
    space.editAsTurn("t1", { kind: "write", text: "# Pay\nexec 666" });
    space.endTurn("t1");
    expect(reviewed(space)).toBe(false);
    type(space, "# Pay\nexec 666\nprint typed");
    const pinned: { envelope: any; name: string }[] = [];
    const result = await exportSpace(space, {
      origin: "https://x.test",
      pin: async (envelope, name) => {
        pinned.push({ envelope, name });
        return { IpfsHash: "QmCid" };
      },
    });
    if (!result.ok) throw new Error("expected a link");
    expect(pinned).toHaveLength(1);
    expect(pinned[0].envelope.minVersion).toBe(SPACE_MIN_VERSION);
    expect(JSON.stringify(pinned[0].envelope)).not.toContain("exec 666");
    const [, cid, key] = result.url.match(/#\/(\w+)#([\w-]+)$/) ?? [];
    expect(cid).toBe("QmCid");
    const payload = await decryptPayload(pinned[0].envelope, key);
    // Typing not yet recorded is part of the space as it is.
    expect(payload.script).toBe("# Pay\nexec 666\nprint typed");
    // The export did not approve anything on its way.
    expect(reviewed(space)).toBe(false);
  });

  test("load --from on an export link yields the script", async () => {
    const { space } = await written();
    const { envelope, key } = await encryptPayload(snapshotSpace(space));
    expect(
      await resolveModuleSource(JSON.stringify(envelope), {
        decryptionKey: key,
      }),
    ).toBe("# Pay\nexec 2");
  });
});

describe("restoring where the space is not", () => {
  test("round trip into another browser: script, revisions and runs, approved, no chats or marks", async () => {
    const { id, space } = await written();
    const exported = exportOf(space);

    const b = testBrowser().tab();
    expect(await restoreSpace(b.spaces, exported, "restore")).toEqual({
      ok: true,
      id,
    });
    const restored = (await b.spaces.acquire(id))!;
    expect(restored.getText()).toBe("# Pay\nexec 2");
    // What the export held, marked as such, and the one revision recorded
    // here: the script as it arrived.
    expect(
      revisions(restored.timeline.getState())
        .map((r) => `${r.source} ${!!r.unverified} ${r.text}`)
        .sort(),
    ).toEqual([
      "import false # Pay\nexec 2",
      "user true # Pay\nexec 1",
      "user true # Pay\nexec 2",
    ]);
    expect(head(restored.timeline.getState())).toMatchObject({
      source: "import",
      origin: { cid: "QmCid" },
    });
    expect(restored.timeline.getState().runs.get(R1)?.unverified).toBe(true);
    expect(restored.timeline.getState().runs.has(R1)).toBe(true);
    // Approved by arriving: the script the export holds, and only it.
    expect(restored.markers.getState()).toEqual({
      approvedText: "# Pay\nexec 2",
    });
    await settle();
    expect(b.spaces.index.getState()[0]).toMatchObject({
      id,
      title: "Pay",
      unreviewed: false,
    });
    expect(await b.storage.records.listChats()).toEqual([]);
    // It is a space like any other from here on.
    type(restored, "# Pay\nexec 3");
    expect(reviewed(restored)).toBe(true);
  });

  test("it survives a reload of that browser", async () => {
    const { id, space } = await written();
    const browser = testBrowser();
    await restoreSpace(browser.tab().spaces, exportOf(space), "restore");
    await settle();
    const later = (await browser.tab().spaces.acquire(id))!;
    expect(later.getText()).toBe("# Pay\nexec 2");
    expect(revisions(later.timeline.getState())).toHaveLength(3);
    expect(reviewed(later)).toBe(true);
  });

  test("an export whose timeline lacks the script gets one revision of it", async () => {
    const id = crypto.randomUUID();
    const b = testBrowser().tab();
    await restoreSpace(
      b.spaces,
      readExport(crafted(id, "exec 9", {}), "QmCid"),
      "restore",
    );
    const space = (await b.spaces.acquire(id))!;
    expect(head(space.timeline.getState())).toMatchObject({
      text: "exec 9",
      source: "import",
      origin: { cid: "QmCid" },
    });
    expect(reviewed(space)).toBe(true);
  });

  test("a run it says is going on arrives interrupted, with nothing live", async () => {
    const id = crypto.randomUUID();
    const live = {
      slots: [{ kind: "box", id: "b" }],
      boxes: {
        b: {
          id: "b",
          state: "live",
          title: "Send",
          detail: "Waiting for wallet…",
          history: [],
          simulated: false,
        },
      },
      live: 1,
    };
    const b = testBrowser().tab();
    await restoreSpace(
      b.spaces,
      readExport(
        crafted(id, "exec 9", {
          entries: [runEntry(R1)],
          runs: [
            run(R1, {
              status: "paused",
              pausedBy: "declined",
              console: live,
            }),
          ],
        }),
        "QmCid",
      ),
      "restore",
    );
    const space = (await b.spaces.acquire(id))!;
    const record = space.timeline.getState().runs.get(R1) as any;
    expect(record.status).toBe("interrupted");
    expect(record.pausedBy).toBeUndefined();
    expect(record.console.live).toBe(0);
    expect(record.console.boxes.b.state).toBe("cancelled");
    // Nothing of it is a run the manager knows: it cannot be resumed.
    await b.runs.adopt(space);
    b.runs.resume(R1);
    expect(b.runs.store.getState()).toEqual({});
    expect(space.timeline.getState().runs.get(R1)?.status).toBe("interrupted");
    await settle();
    expect(b.spaces.index.getState()[0].run).toBeUndefined();
  });

  test("restoring says so, and touches nothing, when the space turns out to be here", async () => {
    const { app, space } = await written();
    const exported = exportOf(space);
    type(space, "# Pay\nexec 3");
    const before = JSON.stringify(orderedEntries(space.timeline.getState()));
    expect(await restoreSpace(app.spaces, exported, "restore")).toEqual({
      ok: false,
      reason: "present",
    });
    expect(space.getText()).toBe("# Pay\nexec 3");
    expect(JSON.stringify(orderedEntries(space.timeline.getState()))).toBe(
      before,
    );
    expect(reviewed(space)).toBe(true);
  });
});

describe("merging into a space that is here", () => {
  test("the same script changes nothing: runs kept as they are, the export's entries added once, still reviewed", async () => {
    const { app, id, space } = await written();
    const exported = exportOf(space);
    space.commit({ runs: [run(R1, { output: "newer", updatedAt: 9 })] });
    const count = revisions(space.timeline.getState()).length;

    expect(await restoreSpace(app.spaces, exported, "merge")).toEqual({
      ok: true,
      id,
    });
    expect(space.getText()).toBe("# Pay\nexec 2");
    expect(space.timeline.getState().runs.get(R1)?.output).toBe("newer");
    expect(revisions(space.timeline.getState())).toHaveLength(count);
    expect(reviewed(space)).toBe(true);
    await restoreSpace(app.spaces, exported, "merge");
    expect(revisions(space.timeline.getState())).toHaveLength(count);
  });

  test("another script replaces the one here as a foreign write: the approved text does not move, pending typing is recorded as the user's first, and the change is one revision that can be taken back", async () => {
    const { app, id, space } = await written();
    const b = testBrowser().tab();
    await restoreSpace(b.spaces, exportOf(space), "restore");
    const there = (await b.spaces.acquire(id))!;
    type(there, "# Pay\nexec 2\nprint from b");
    there.record("user");
    const theirs = exportOf(there);

    type(space, "# Pay typed\nexec 2");
    expect(reviewed(space)).toBe(true);

    expect(await restoreSpace(app.spaces, theirs, "merge")).toEqual({
      ok: true,
      id,
    });
    expect(space.getText()).toBe("# Pay\nexec 2\nprint from b");
    expect(space.markers.getState().approvedText).toBe("# Pay typed\nexec 2");
    expect(reviewed(space)).toBe(false);
    const last = head(space.timeline.getState())!;
    expect(last).toMatchObject({
      source: "merge",
      text: space.getText(),
      origin: { cid: "QmCid" },
    });
    expect(last.unverified).toBeUndefined();
    const before = space.timeline.getState().entries.get(last.parent!);
    expect(before).toMatchObject({
      kind: "revision",
      source: "user",
      text: "# Pay typed\nexec 2",
    });
    // A real run is refused until the user has reviewed it.
    app.spaces.show(id);
    expect(await app.runs.start(id, { mode: "real" })).toMatchObject({
      ok: false,
      reason: "unreviewed",
    });
    // Ctrl+Z is the user's own history: the merge is not in it.
    space.undo.undo();
    expect(reviewed(space)).toBe(false);
    // Restore to before lands on what was approved.
    expect(restoreBefore(space, last.id)).toEqual({ ok: true });
    expect(space.getText()).toBe("# Pay typed\nexec 2");
    expect(reviewed(space)).toBe(true);
  });

  test("another tab of the browser sees the merge and does not approve it either", async () => {
    const a = testBrowser();
    const first = a.tab();
    const { id, space } = await written(first);
    const second = (await a.tab().spaces.acquire(id))!;
    const theirs = readExport(
      crafted(id, "# Pay\nexec 2\nprint from b", {}),
      "QmCid",
    );
    await restoreSpace(first.spaces, theirs, "merge");
    await settle();
    expect(space.getText()).toBe("# Pay\nexec 2\nprint from b");
    expect(second.getText()).toBe("# Pay\nexec 2\nprint from b");
    expect(reviewed(second)).toBe(false);
    expect(head(second.timeline.getState())?.source).toBe("merge");
  });

  test("a crafted export leaves a changed script unreviewed, whatever it claims", async () => {
    const { app, id, space } = await written();
    const mine = space.getText();
    const evil = "exec 0xdead";
    const theirs = revision(evil, undefined, { ts: 0 });
    const hostile = crafted(
      id,
      evil,
      {
        // Backdated, in the user's name, "verified" and "approved".
        entries: [theirs, { ...revision(mine), ts: 9e15, unverified: false }],
        // Removals of everything the user has.
        removals: orderedEntries(space.timeline.getState()).map((entry) => ({
          entryId: entry.id,
          by: me,
          ts: 0,
        })),
        approvedText: evil,
        markers: { approvedText: evil },
      },
      { approvedText: evil, markers: { approvedText: evil } },
    );
    const mineBefore = orderedEntries(space.timeline.getState());

    await restoreSpace(app.spaces, readExport(hostile, "QmCid"), "merge");
    expect(space.getText()).toBe(evil);
    expect(space.markers.getState().approvedText).toBe(mine);
    expect(reviewed(space)).toBe(false);
    // Nothing the user had is gone or rewritten, and no removal came in.
    const after = space.timeline.getState();
    for (const entry of mineBefore)
      expect(after.entries.get(entry.id)).toEqual(entry);
    expect(after.runs.has(R1)).toBe(true);
    expect(after.removals.size).toBe(0);
    // What it brought says where it came from, not "the user".
    expect(after.entries.get(theirs.id)).toMatchObject({ unverified: true });
    // Stored that way too.
    await settle();
    expect(await app.storage.records.getMarkers(id)).toMatchObject({
      approvedText: mine,
    });
    expect((await app.storage.records.loadTimeline(id)).removals).toHaveLength(
      0,
    );
    app.spaces.show(id);
    expect(await app.runs.start(id, { mode: "real" })).toMatchObject({
      ok: false,
      reason: "unreviewed",
    });
  });

  test("a revision an export holds ahead of time does not stand for the one the user records", async () => {
    const { app, id, space } = await written();
    const next = "# Pay\nexec 3";
    // The obvious next state, squatted with the attacker's explanation.
    const squat = revision(next, head(space.timeline.getState())!.id, {
      summary: "approved by the treasury",
    });
    await restoreSpace(
      app.spaces,
      readExport(crafted(id, space.getText(), { entries: [squat] }), "QmCid"),
      "merge",
    );
    expect(space.timeline.getState().entries.get(squat.id)).toMatchObject({
      unverified: true,
      summary: "approved by the treasury",
    });
    type(space, next);
    const mine = space.record("user")!;
    expect(mine.id).toBe(squat.id);
    const stands = space.timeline.getState().entries.get(squat.id)!;
    expect(stands).toEqual(mine);
    expect("summary" in stands).toBe(false);
    expect(stands.unverified).toBeUndefined();
    await settle();
    const stored = (await app.storage.records.loadTimeline(id)).entries.find(
      (entry) => entry.id === squat.id,
    );
    expect(stored).toEqual(mine);
  });

  test("merging into the space on screen while it runs leaves the run its own record", async () => {
    const { app, id, space } = await written();
    space.commit({
      runs: [run(uuid(7), { status: "running", output: "mine" })],
      entries: [runEntry(uuid(7))],
    });
    app.spaces.show(id);
    await restoreSpace(
      app.spaces,
      readExport(
        crafted(id, "exec 0xdead", {
          runs: [run(uuid(7), { status: "success", updatedAt: 9e15 })],
        }),
        "QmCid",
      ),
      "merge",
    );
    expect(space.timeline.getState().runs.get(uuid(7))).toMatchObject({
      status: "running",
      output: "mine",
    });
  });

  test("an entry removed here does not come back with an older export", async () => {
    const { app, space } = await written();
    const exported = exportOf(space);
    const [first] = revisions(space.timeline.getState());
    space.commit({
      removals: [
        { entryId: first.id, by: me, ts: 50 },
        { entryId: R1, by: me, ts: 50 },
      ],
    });
    await restoreSpace(app.spaces, exported, "merge");
    expect(space.timeline.getState().entries.has(first.id)).toBe(false);
    expect(space.timeline.getState().entries.has(R1)).toBe(false);
    expect(space.timeline.getState().runs.has(R1)).toBe(false);
  });

  test("merging says so when the space is gone", async () => {
    const { space } = await written();
    const b = testBrowser().tab();
    expect(await restoreSpace(b.spaces, exportOf(space), "merge")).toEqual({
      ok: false,
      reason: "absent",
    });
    expect(b.spaces.index.getState()).toEqual([]);
  });
});

describe("every way an export arrives follows the same rules", () => {
  const first = "exec 1";
  const later = "exec 2";
  const root = revisionId(first, undefined);
  const live = {
    slots: [
      { kind: "line", text: "![x](https://evil.test/p.png)" },
      { kind: "box", id: "b" },
    ],
    boxes: {
      b: {
        id: "b",
        state: "live",
        title: "Send",
        detail: "Waiting",
        history: [],
        simulated: false,
        links: { tx: "https://evil.test/" },
      },
    },
    live: 1,
  };
  /** An export of a space whose script is `first`, crafted to tamper. */
  const hostile = (id: string) =>
    readExport(
      crafted(id, first, {
        entries: [
          {
            ...revision(first, undefined, {
              summary: `a\nb ${"x".repeat(999)}`,
            }),
            unverified: false,
          },
          runEntry(R1),
          {
            kind: "share",
            id: uuid(3),
            ts: 1,
            author: me,
            revisionId: root,
            cid: "QmZYrSACX7w6DbPg2SRJ4JrKkZpHbg86mqQ27xvChTCRry",
            key: "A".repeat(43),
          },
        ],
        runs: [run(R1, { status: "running", console: live })],
        // For revisions the user will record on top of what is there.
        removals: [revisionId(later, root), revisionId(later, undefined)].map(
          (entryId) => ({ entryId, by: me, ts: 1 }),
        ),
      }),
      "QmCid",
    );

  const paths: [string, (id: string) => Promise<LiveSpace>][] = [
    [
      "restored where the space is not",
      async (id) => {
        const app = testBrowser().tab();
        await restoreSpace(app.spaces, hostile(id), "restore");
        return (await app.spaces.acquire(id))!;
      },
    ],
    [
      "merged into a space that is here",
      async (id) => {
        const app = testBrowser().tab();
        await app.spaces.create({ text: first, source: "user" }, id);
        await restoreSpace(app.spaces, hostile(id), "merge");
        return (await app.spaces.acquire(id))!;
      },
    ],
  ];

  test.each(paths)("%s", async (_, arrive) => {
    const space = await arrive(crypto.randomUUID());
    const state = space.timeline.getState();
    // No removal is kept, and none suppresses what the user records.
    expect(state.removals.size).toBe(0);
    expect(head(state)?.text).toBe(first);
    expect(head(state)?.unverified).toBeUndefined();
    type(space, later);
    const recorded = space.record("user");
    expect(recorded).not.toBeNull();
    expect(space.timeline.getState().entries.get(recorded!.id)).toEqual(
      recorded!,
    );
    // What it brought is marked, its run ended, its console with no link
    // and nothing live, its link not adopted.
    const run1 = state.runs.get(R1) as any;
    expect(run1).toMatchObject({ status: "interrupted", unverified: true });
    expect(run1.console).toMatchObject({ live: 0, unverified: true });
    expect(run1.console.boxes.b.links).toBeUndefined();
    expect(state.entries.get(R1)).toMatchObject({ unverified: true });
    expect([...state.entries.values()].some((e) => e.kind === "share")).toBe(
      false,
    );
  });

  test("a text it brings is held to a line", async () => {
    const app = testBrowser().tab();
    const id = crypto.randomUUID();
    const theirs = revision("another", undefined, {
      summary: `a\nb ${"x".repeat(999)}`,
    });
    await restoreSpace(
      app.spaces,
      readExport(crafted(id, first, { entries: [theirs] }), "QmCid"),
      "restore",
    );
    const space = (await app.spaces.acquire(id))!;
    const kept = space.timeline.getState().entries.get(theirs.id);
    if (kept?.kind !== "revision") throw new Error("expected a revision");
    expect(kept.unverified).toBe(true);
    expect(kept.summary).toHaveLength(600);
    expect(kept.summary?.startsWith("a b x")).toBe(true);
  });

  test("opening the same export again writes nothing to storage", async () => {
    const { app, id, space } = await written();
    const b = testBrowser().tab();
    const payload = overTheWire(snapshotSpace(space));
    await restoreSpace(b.spaces, readExport(payload, "QmCid"), "restore");
    await settle();
    const stored = JSON.stringify(await b.storage.records.loadTimeline(id));
    let writes = 0;
    const merge = b.storage.records.mergeTimeline;
    b.storage.records.mergeTimeline = (...args) => {
      writes++;
      return merge(...args);
    };
    for (let i = 0; i < 3; i++)
      await restoreSpace(b.spaces, readExport(payload, "QmCid"), "merge");
    await settle();
    expect(writes).toBe(0);
    expect(JSON.stringify(await b.storage.records.loadTimeline(id))).toBe(
      stored,
    );
    void app;
  });

  test("more revisions than a space keeps from links never cost a revision recorded here, on either path", async () => {
    const many = (id: string) =>
      readExport(
        crafted(id, first, {
          entries: Array.from({ length: 700 }, (_, i) => ({
            ...revision(`t${i}`),
            ts: Date.now(),
          })),
        }),
        "QmCid",
      );
    const local = (space: LiveSpace) =>
      revisions(space.timeline.getState()).filter((r) => !r.unverified);
    const work = (space: LiveSpace, from: number) => {
      for (let i = from; i < from + 5; i++) {
        type(space, `mine ${i}`);
        space.record("user");
      }
    };
    // Into a space with history of its own.
    const a = testBrowser().tab();
    const here = await a.spaces.create({ text: first, source: "user" });
    const mine = (await a.spaces.acquire(here))!;
    work(mine, 0);
    const before = local(mine).map((r) => r.id);
    await restoreSpace(a.spaces, many(here), "merge");
    work(mine, 5);
    const after = new Set(local(mine).map((r) => r.id));
    for (const id of before) expect(after.has(id)).toBe(true);
    expect(mine.timeline.getState().removals.size).toBe(0);
    expect(
      revisions(mine.timeline.getState()).filter((r) => r.unverified),
    ).toHaveLength(300);
    // Into a browser without it, then local work.
    const b = testBrowser().tab();
    const there = crypto.randomUUID();
    await restoreSpace(b.spaces, many(there), "restore");
    const restored = (await b.spaces.acquire(there))!;
    work(restored, 0);
    expect(local(restored)).toHaveLength(6);
    expect(restored.timeline.getState().removals.size).toBe(0);
  });

  test("open as copy takes the script and nothing else", async () => {
    const app = testBrowser().tab();
    const result = await restoreSpace(
      app.spaces,
      hostile(crypto.randomUUID()),
      "copy",
    );
    if (!result.ok) throw new Error("expected a copy");
    const space = (await app.spaces.acquire(result.id))!;
    const state = space.timeline.getState();
    expect(state.removals.size).toBe(0);
    expect(state.runs.size).toBe(0);
    expect(revisions(state)).toHaveLength(1);
    type(space, later);
    expect(space.record("user")).not.toBeNull();
  });
});

describe("open as copy", () => {
  test("a new space of the export's script, approved, that records where it came from; the original is untouched", async () => {
    const { app, id, space } = await written();
    const result = await restoreSpace(app.spaces, exportOf(space), "copy");
    if (!result.ok) throw new Error("expected a copy");
    expect(result.id).not.toBe(id);
    const copy = (await app.spaces.acquire(result.id))!;
    expect(copy.getText()).toBe("# Pay\nexec 2");
    expect(reviewed(copy)).toBe(true);
    expect(revisions(copy.timeline.getState())).toMatchObject([
      { source: "import", origin: { cid: "QmCid" } },
    ]);
    expect(copy.timeline.getState().runs.size).toBe(0);
    type(copy, "# Copy");
    expect(space.getText()).toBe("# Pay\nexec 2");
  });
});

describe("an export that is not one", () => {
  const good = () => crafted(crypto.randomUUID(), "exec 1", {});
  const broken: [string, (p: any) => void][] = [
    ["an id that is no space id", (p) => (p.id = "../../etc")],
    [
      "a CID for an id",
      (p) => (p.id = "QmZYrSACX7w6DbPg2SRJ4JrKkZpHbg86mqQ27xvChTCRry"),
    ],
    ["a timeline that is no record", (p) => (p.timeline = [])],
    [
      "an entry of an unknown kind",
      (p) =>
        (p.timeline = {
          entries: [{ kind: "x", id: uuid(1), ts: 1, author: me }],
        }),
    ],
    [
      "a forged revision",
      (p) => (p.timeline = { entries: [{ ...revision("a"), text: "b" }] }),
    ],
    [
      "a run with a console that is none",
      (p) =>
        (p.timeline = {
          runs: [
            run(R1, {
              console: {
                slots: [{ kind: "box", id: "nope" }],
                boxes: {},
                live: 0,
              },
            }),
          ],
        }),
    ],
  ];
  test.each(broken)("%s is refused", (_, breakIt) => {
    const payload = good();
    breakIt(payload);
    expect(() => readExport(payload, "QmCid")).toThrow();
  });

  test("past the limits it is refused", () => {
    const big = "x".repeat(IMPORT_LIMITS.script + 1);
    expect(() =>
      readExport(crafted(crypto.randomUUID(), big, {}), "QmCid"),
    ).toThrow(/too long/);
  });

  test("a refused export leaves an existing space exactly as it was", async () => {
    const { app, id, space } = await written();
    const before = {
      text: space.getText(),
      entries: JSON.stringify(orderedEntries(space.timeline.getState())),
      markers: space.markers.getState(),
    };
    const hostile = crafted(id, "exec 0xdead", {
      entries: [revision("exec 0xdead"), { kind: "x" }],
    });
    expect(() => readExport(hostile, "QmCid")).toThrow();
    await settle();
    expect(space.getText()).toBe(before.text);
    expect(JSON.stringify(orderedEntries(space.timeline.getState()))).toBe(
      before.entries,
    );
    expect(space.markers.getState()).toBe(before.markers);
    expect(app.spaces.index.getState()).toHaveLength(1);
  });

  test("a space too large to open again is not pinned", async () => {
    const { space } = await written();
    type(space, "x".repeat(IMPORT_LIMITS.script + 1));
    let pinned = 0;
    const result = await exportSpace(space, {
      origin: "https://x.test",
      pin: async () => {
        pinned++;
        return { IpfsHash: "QmCid" };
      },
    });
    expect(result.ok).toBe(false);
    expect(pinned).toBe(0);
  });
});
