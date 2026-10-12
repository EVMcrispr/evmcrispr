import { describe, expect, test } from "bun:test";
import {
  emptyTimeline,
  IMPORT_LIMITS,
  MAX_UNVERIFIED,
  MalformedExport,
  mergeable,
  mergeTimeline,
  parseTimeline,
  type RevisionEntry,
  type RunRecord,
  revisionId,
  type TimelineEntry,
} from "../src";

const NOW = 1_000;
const me = { kind: "user" } as const;
const consoleOf = (raw: unknown) => ({ checked: raw });
const plain = (text: string) => text.replace(/\s+/g, " ").trim();
const parse = (raw: unknown) =>
  parseTimeline(raw, { console: consoleOf, plain, now: NOW });
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const R1 = uuid(1);

const revision = (text: string, parent?: string, extra = {}) => ({
  kind: "revision",
  id: revisionId(text, parent),
  ts: 5,
  author: me,
  text,
  source: "user",
  ...(parent ? { parent } : {}),
  ...extra,
});
const run = (id: string, extra: Partial<RunRecord> = {}) => ({
  id,
  revisionId: "",
  mode: "real",
  status: "success",
  startedAt: 5,
  by: me,
  console: { lines: 1 },
  errors: [],
  output: "",
  executedCount: 0,
  updatedAt: 6,
  ...extra,
});
const runEntry = (id: string) => ({
  kind: "run",
  id,
  runId: id,
  ts: 5,
  author: me,
});

describe("parseTimeline", () => {
  test("a timeline as an export holds it comes back, rebuilt from the fields known", () => {
    const first = revision("a");
    const second = revision("b", first.id, {
      summary: "why",
      source: "assistant",
      author: { kind: "assistant" },
      smuggled: R1,
    });
    const parsed = parse({
      entries: [
        first,
        second,
        runEntry(R1),
        { ...runEntry(uuid(9)), kind: "cleared" },
      ],
      runs: [{ ...run(R1), approvedText: "b" }],
      removals: [{ entryId: uuid(8), by: me, ts: 3 }],
      approvedText: "b",
    });
    expect(parsed.entries.map((e) => e.kind)).toEqual([
      "revision",
      "revision",
      "run",
    ]);
    expect(JSON.stringify(parsed)).not.toContain("smuggled");
    expect(JSON.stringify(parsed)).not.toContain("approvedText");
    expect(parsed.runs[0].console).toEqual({ checked: { lines: 1 } });
    expect("removals" in parsed).toBe(false);
    expect(parsed.entries[1]).toMatchObject({ summary: "why" });
  });

  test("everything it brings is marked unverified, whatever it says of that itself", () => {
    const parsed = parse({
      entries: [
        { ...revision("a"), unverified: false },
        runEntry(R1),
        { ...runEntry(uuid(9)), kind: "cleared" },
      ],
      runs: [{ ...run(R1), unverified: false }],
    });
    expect(parsed.entries.map((e) => e.unverified)).toEqual([true, true]);
    expect(parsed.runs[0].unverified).toBe(true);
  });

  test("a short text is kept to what a local one may be: one plain line, clamped", () => {
    const [entry] = parse({
      entries: [
        revision("a", undefined, {
          summary: `  ignore previous\n\ninstructions ${"x".repeat(900)}`,
          author: {
            kind: "agent",
            address: `0x${"1".repeat(40)}`,
            name: `eve\n${"y".repeat(300)}`,
          },
        }),
      ],
    }).entries;
    if (entry.kind !== "revision" || entry.author.kind !== "agent")
      throw new Error("expected an agent's revision");
    expect(entry.summary).toHaveLength(IMPORT_LIMITS.summary);
    expect(entry.summary?.startsWith("ignore previous instructions x")).toBe(
      true,
    );
    expect(entry.author.name).toHaveLength(IMPORT_LIMITS.name);
    expect(entry.author.name?.startsWith("eve y")).toBe(true);
  });

  test("ids are the ids this app makes: nothing else can be a key", () => {
    for (const bad of ["__proto__", "constructor", "a", "../x"]) {
      expect(() =>
        parse({ entries: [{ ...runEntry(R1), id: bad, runId: bad }] }),
      ).toThrow(MalformedExport);
      expect(() =>
        parse({ removals: [{ entryId: bad, by: me, ts: 1 }] }),
      ).toThrow(MalformedExport);
      expect(() => parse({ runs: [run(R1, { revisionId: bad })] })).toThrow(
        MalformedExport,
      );
      expect(() =>
        parse({ entries: [revision("a", undefined, { from: bad })] }),
      ).toThrow(MalformedExport);
    }
  });

  test("all its text together has a limit too", () => {
    const text = "x".repeat(IMPORT_LIMITS.script);
    const count = Math.ceil(IMPORT_LIMITS.total / IMPORT_LIMITS.script) + 1;
    let parent: string | undefined;
    const entries = Array.from({ length: count }, () => {
      const next = revision(text, parent);
      parent = next.id;
      return next;
    });
    expect(() => parse({ entries })).toThrow(/too much/);
  });

  test("nothing is required to be there", () => {
    expect(parse({})).toEqual({ entries: [], runs: [] });
  });

  test("a revision that is not what its id says refuses the whole export", () => {
    const forged = { ...revision("a"), text: "b" };
    expect(() => parse({ entries: [forged] })).toThrow(MalformedExport);
  });

  test.each([
    ["not an object", []],
    ["entries not a list", { entries: {} }],
    [
      "an unknown kind",
      { entries: [{ ...runEntry(R1), kind: "message", text: "hi" }] },
    ],
    [
      "an id that is no id",
      { entries: [{ ...runEntry(R1), id: "a b", runId: "a b" }] },
    ],
    [
      "a run entry of another run",
      { entries: [{ ...runEntry(R1), runId: "y" }] },
    ],
    ["a time that is no time", { entries: [{ ...runEntry(R1), ts: "1" }] }],
    [
      "an unknown author",
      { entries: [{ ...runEntry(R1), author: { kind: "admin" } }] },
    ],
    [
      "an address that is none",
      {
        entries: [
          { ...runEntry(R1), author: { kind: "user", address: "0x1" } },
        ],
      },
    ],
    ["a text that is no string", { entries: [{ ...revision("a"), text: 1 }] }],
    [
      "an unknown source",
      { entries: [revision("a", undefined, { source: "god" })] },
    ],
    ["an unknown status", { runs: [run(R1, { status: uuid(5) as never })] }],
    [
      "errors that are no strings",
      { runs: [run(R1, { errors: [1] as never })] },
    ],
    ["a removal with no author", { removals: [{ entryId: R1, ts: 1 }] }],
    [
      "a share with a key that is none",
      {
        entries: [
          {
            kind: "share",
            id: uuid(3),
            ts: 1,
            author: me,
            revisionId: R1,
            cid: "Qm",
            key: "short",
          },
        ],
      },
    ],
  ])("%s is refused", (_, raw) => {
    expect(() => parse(raw)).toThrow(MalformedExport);
  });

  test("past its limits it is refused, with the limit named", () => {
    const text = R1.repeat(IMPORT_LIMITS.script + 1);
    expect(() => parse({ entries: [revision(text)] })).toThrow(/too long/);
    const many = Array.from({ length: IMPORT_LIMITS.runs + 1 }, (_, i) =>
      run(uuid(i)),
    );
    expect(() => parse({ runs: many })).toThrow(/too many/);
  });

  test("a console the host refuses refuses the export", () => {
    expect(() =>
      parseTimeline(
        { runs: [run(R1)] },
        {
          console: () => {
            throw new Error("no");
          },
          plain,
          now: NOW,
        },
      ),
    ).toThrow(MalformedExport);
  });

  test("no run arrives unfinished: it is interrupted, and nothing says it waits", () => {
    for (const status of ["running", "paused", "watching"] as const) {
      const [record] = parse({
        runs: [run(R1, { status, pausedBy: "declined", updatedAt: 9 })],
      }).runs;
      expect(record.status).toBe("interrupted");
      expect(record.endedAt).toBe(9);
      expect("pausedBy" in record).toBe(false);
    }
    expect(parse({ runs: [run(R1)] }).runs[0].status).toBe("success");
  });

  test("no time is later than now", () => {
    const parsed = parse({
      entries: [{ ...runEntry(R1), ts: 9e15 }],
      runs: [run(R1, { startedAt: 9e15, endedAt: 9e15, updatedAt: 9e15 })],
    });
    expect(parsed.entries[0].ts).toBe(NOW);
    expect(parsed.runs[0]).toMatchObject({
      startedAt: NOW,
      endedAt: NOW,
      updatedAt: NOW,
    });
  });

  test("a link made elsewhere is checked and not adopted", () => {
    const share = {
      kind: "share",
      id: uuid(3),
      ts: 1,
      author: me,
      revisionId: revisionId("a", undefined),
      cid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      key: "A".repeat(43),
    };
    expect(parse({ entries: [revision("a"), share] }).entries).toHaveLength(1);
  });
});

describe("limits are checked before the work they bound", () => {
  /** A record whose fields say when they are read. */
  const watched = <T extends object>(fields: T, read: { count: number }) =>
    new Proxy(fields, {
      get(target, key, receiver) {
        if (key === "text" || key === "console") read.count++;
        return Reflect.get(target, key, receiver);
      },
    });

  test("too many records: none of them is read", () => {
    const read = { count: 0 };
    const hooks = { console: consoleOf, plain, now: NOW };
    const entries = Array.from({ length: IMPORT_LIMITS.entries + 1 }, () =>
      watched(revision("a"), read),
    );
    expect(() => parseTimeline({ entries }, hooks)).toThrow(/too many/);
    const runs = Array.from({ length: IMPORT_LIMITS.runs + 1 }, (_, i) =>
      watched(run(uuid(i)), read),
    );
    expect(() =>
      parseTimeline({ entries: [watched(revision("a"), read)], runs }, hooks),
    ).toThrow(/too many/);
    const removals = Array.from({ length: IMPORT_LIMITS.removals + 1 }, () => ({
      entryId: R1,
      by: me,
      ts: 1,
    }));
    expect(() =>
      parseTimeline(
        { entries: [watched(revision("a"), read)], removals },
        hooks,
      ),
    ).toThrow(/too many/);
    expect(read.count).toBe(0);
  });

  test("past the total, nothing further is read", () => {
    const read = { count: 0 };
    const text = "x".repeat(IMPORT_LIMITS.script);
    const fits = Math.floor(IMPORT_LIMITS.total / IMPORT_LIMITS.script);
    let parent: string | undefined;
    const entries = Array.from({ length: fits + 5 }, () => {
      const next = revision(text, parent);
      parent = next.id;
      return watched(next, read);
    });
    expect(() => parse({ entries })).toThrow(/too much/);
    expect(read.count).toBe(fits + 1);
  });

  test("a script that is too long is refused before it is hashed", () => {
    const long = "x".repeat(IMPORT_LIMITS.script + 1);
    const started = performance.now();
    // An id that could only be told wrong by hashing: refused for length.
    expect(() =>
      parse({ entries: [{ ...revision("a"), text: long }] }),
    ).toThrow(/too long/);
    expect(performance.now() - started).toBeLessThan(50);
  });

  test("what the export declares removed is not read at all", () => {
    const read = { count: 0 };
    const gone = revision("a");
    const parsed = parse({
      entries: [watched(gone, read)],
      runs: [watched(run(R1), read)],
      removals: [
        { entryId: gone.id, by: me, ts: 1 },
        { entryId: R1, by: me, ts: 1 },
      ],
    });
    expect(parsed).toEqual({ entries: [], runs: [] } as never);
    expect(read.count).toBe(0);
  });
});

describe("mergeable", () => {
  const mine = mergeTimeline(emptyTimeline, {
    entries: [
      revision("mine") as TimelineEntry,
      runEntry(uuid(5)) as TimelineEntry,
      runEntry(uuid(6)) as TimelineEntry,
    ],
    runs: [
      run(uuid(5), { status: "running" }) as RunRecord,
      run(uuid(6), { output: "mine" }) as RunRecord,
    ],
  }).state;

  test("an export only adds: its removals delete nothing here and are not kept, wherever it arrives", () => {
    const theirs = parse({
      entries: [revision("theirs")],
      removals: [
        { entryId: revisionId("mine", undefined), by: me, ts: 1 },
        { entryId: uuid(6), by: me, ts: 1 },
        // A revision the user has yet to record.
        {
          entryId: revisionId("later", revisionId("mine", undefined)),
          by: me,
          ts: 1,
        },
      ],
    });
    for (const local of [mine, emptyTimeline]) {
      const patch = mergeable(local, theirs);
      expect(patch.removals ?? []).toEqual([]);
      const { state } = mergeTimeline(local, patch);
      expect(state.removals.size).toBe(0);
      expect(state.entries.has(revisionId("theirs", undefined))).toBe(true);
      for (const id of local.entries.keys())
        expect(state.entries.has(id)).toBe(true);
    }
  });

  test("a run this copy has keeps its record, whatever the export's says of itself", () => {
    const theirs = parse({
      runs: [
        run(uuid(5), { status: "success", updatedAt: 999 }),
        run(uuid(6), { output: "theirs", updatedAt: 999 }),
        run(uuid(7), { output: "new" }),
      ],
    });
    const { state } = mergeTimeline(mine, mergeable(mine, theirs));
    expect(state.runs.get(uuid(5))?.status).toBe("running");
    expect(state.runs.get(uuid(6))?.output).toBe("mine");
    expect(state.runs.get(uuid(7))?.output).toBe("new");
  });

  const at = (now: number) => (raw: unknown) =>
    parseTimeline(raw, { console: consoleOf, plain, now });
  const maximal = (tag: string, count = MAX_UNVERIFIED) => {
    const runs = Array.from({ length: count }, (_, i) =>
      run(crypto.randomUUID(), { startedAt: i }),
    );
    return {
      entries: [
        ...Array.from({ length: count }, (_, i) => ({
          ...revision(`${tag}${i}`),
          ts: i,
        })),
        ...runs.map((r) => runEntry(r.id)),
      ],
      runs,
    };
  };
  const unverified = (state: ReturnType<typeof mergeTimeline>["state"]) => ({
    revisions: [...state.entries.values()].filter(
      (e) => e.kind === "revision" && e.unverified,
    ),
    runs: [...state.runs.values()].filter((r) => r.unverified),
    runEntries: [...state.entries.values()].filter(
      (e) => e.kind === "run" && e.unverified,
    ),
  });
  const take = (
    state: ReturnType<typeof mergeTimeline>["state"],
    raw: unknown,
    now: number,
  ) => mergeTimeline(state, mergeable(state, at(now)(raw)));

  test("of an export larger than the allowance, the latest are kept", () => {
    const { state } = take(emptyTimeline, maximal("t", MAX_UNVERIFIED + 40), 1);
    const held = unverified(state);
    expect(held.revisions).toHaveLength(MAX_UNVERIFIED);
    expect(held.runs).toHaveLength(MAX_UNVERIFIED);
    // A run entry arrives only with its record.
    expect(held.runEntries).toHaveLength(MAX_UNVERIFIED);
    expect(
      held.revisions.some((e) => e.kind === "revision" && e.text === "t0"),
    ).toBe(false);
  });

  test("a full allowance never refuses an import: the oldest taken in give way to the newest, by when this browser took them", () => {
    // The first export dates everything in the future of the second.
    const first = maximal("a");
    for (const e of first.entries) (e as { ts: number }).ts += 1e6;
    let { state } = take(emptyTimeline, first, 1);
    const second = { entries: [revision("mine again")], runs: [run(uuid(9))] };
    const merged = take(state, second, 2);
    state = merged.state;
    const held = unverified(state);
    expect(held.revisions).toHaveLength(MAX_UNVERIFIED);
    expect(held.runs).toHaveLength(MAX_UNVERIFIED);
    expect(state.entries.has(revisionId("mine again", undefined))).toBe(true);
    expect(state.runs.has(uuid(9))).toBe(true);
    // What gave way left no removal behind: it can be taken in again.
    expect(state.removals.size).toBe(0);
    expect(merged.changed.forget).toHaveLength(2);
    const again = take(state, first, 3).state;
    expect(unverified(again).revisions).toHaveLength(MAX_UNVERIFIED);
    // The one that had given way is back; the longest held went for it.
    expect(
      merged.changed.forget.every(
        (id) => again.entries.has(id) || again.runs.has(id),
      ),
    ).toBe(true);
    expect(again.entries.has(revisionId("mine again", undefined))).toBe(true);
  });

  test("the same export again changes nothing", () => {
    const raw = maximal("a", 20);
    const first = take(emptyTimeline, raw, 1);
    for (const now of [2, 3]) {
      const again = take(first.state, raw, now);
      expect(again.state).toBe(first.state);
      expect(again.changed).toEqual({
        entries: [],
        runs: [],
        removals: [],
        forget: [],
      });
    }
  });

  test("ten maximal exports leave no more than one would, in count and in size", () => {
    const big = "x".repeat(IMPORT_LIMITS.script);
    const fits = Math.floor(IMPORT_LIMITS.total / IMPORT_LIMITS.script);
    let state = emptyTimeline;
    for (let n = 0; n < 10; n++) {
      // One of many small records, one of few huge ones.
      state = take(state, maximal(`n${n}-`), n * 2).state;
      state = take(
        state,
        {
          entries: Array.from({ length: fits }, (_, i) =>
            revision(`${n}:${i}:${big}`.slice(0, IMPORT_LIMITS.script)),
          ),
        },
        n * 2 + 1,
      ).state;
      const held = unverified(state);
      expect(held.revisions.length).toBeLessThanOrEqual(MAX_UNVERIFIED);
      expect(held.runs.length).toBeLessThanOrEqual(MAX_UNVERIFIED);
      const size = [...held.revisions, ...held.runs].reduce(
        (total, record) => total + (record.intake?.size ?? 0),
        0,
      );
      expect(size).toBeLessThanOrEqual(IMPORT_LIMITS.total);
    }
  });

  test("what was recorded here is never what gives way, and leaves the count when it takes an unverified entry's place", () => {
    const mine = Array.from({ length: 50 }, (_, i) => ({
      ...(revision(`mine${i}`) as RevisionEntry),
    }));
    let state = mergeTimeline(emptyTimeline, { entries: mine }).state;
    state = take(state, maximal("a"), 1).state;
    state = take(state, maximal("b"), 2).state;
    for (const entry of mine)
      expect(state.entries.get(entry.id)).toEqual(entry);
    const squatted = revision("b7") as RevisionEntry;
    state = mergeTimeline(state, { entries: [squatted] }).state;
    expect(unverified(state).revisions).toHaveLength(MAX_UNVERIFIED - 1);
  });

  test("the size of a record counts everything it holds, its console too", () => {
    const parsed = parseTimeline(
      {
        entries: [revision("abc", undefined, { summary: "why" })],
        runs: [run(R1, { output: "12345", errors: ["12"] })],
      },
      { console: consoleOf, consoleSize: () => 1000, plain, now: 7 },
    );
    expect(parsed.entries[0].intake).toEqual({ at: 7, size: 6 });
    expect(parsed.runs[0].intake).toEqual({ at: 7, size: 1007 });
  });

  test("a console's size counts toward the total of an export", () => {
    expect(() =>
      parseTimeline(
        { runs: [run(R1), run(uuid(2))] },
        {
          console: consoleOf,
          consoleSize: () => IMPORT_LIMITS.total / 2 + 1,
          plain,
          now: 1,
        },
      ),
    ).toThrow(/too much/);
  });

  test("an account of a clearing elsewhere is not taken in", () => {
    expect(
      parse({ entries: [{ ...runEntry(uuid(9)), kind: "cleared" }] }).entries,
    ).toEqual([]);
  });
});
