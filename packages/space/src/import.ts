// A timeline that arrives from outside this browser (an export; later a
// relay) is data written by whoever made it. Nothing in it is believed:
// it is checked field by field and rebuilt from the fields known here, and
// what it says about itself (its authors, its times, its removals, the
// state of its runs) only ever ends up on screen. Whether a script is
// reviewed is never asked of any of it: see `review.ts`.
import { revisionId } from "./hash";
import type { TimelinePatch, TimelineRecords, TimelineState } from "./timeline";
import {
  type Author,
  type RevisionEntry,
  type RunRecord,
  type TimelineEntry,
  UNFINISHED,
} from "./types";

/** Past any of these an export is refused outright, each before the work
 *  it bounds: counts before a record is read, a text's length and the
 *  total before it is hashed or kept. They are the second line: the host
 *  caps the size of the whole export before decrypting it. */
export const IMPORT_LIMITS = {
  /** Characters of a script. */
  script: 500_000,
  /** Characters of everything a run printed. */
  output: 1_000_000,
  /** Characters of one error of a run. */
  error: 10_000,
  /** Characters of all the text an export brings, together: what it may
   *  add to storage. */
  total: 6_000_000,
  /** Far fewer are kept (`MAX_UNVERIFIED` revisions, as many runs): this
   *  is what is read to choose them. */
  entries: 2_000,
  runs: 1_000,
  removals: 5_000,
  /** Short texts are clamped, not refused, to what a local one may be: an
   *  explanation is one plain line of a turn's length, a name a label. */
  summary: 600,
  name: 100,
} as const;

declare const checked: unique symbol;
/** A timeline from outside that went through `parseTimeline`: the only
 *  way to get one, so nothing unchecked can be handed where one is asked
 *  for. */
export type CheckedTimeline = Pick<TimelineRecords, "entries" | "runs"> & {
  readonly [checked]: true;
};

/** The export is not one this version can take in. The message says why,
 *  in words for the person who opened the link. */
export class MalformedExport extends Error {}

const fail = (why: string): never => {
  throw new MalformedExport(why);
};

type Raw = Record<string, unknown>;

const record = (x: unknown, what: string): Raw =>
  typeof x === "object" && x !== null && !Array.isArray(x)
    ? (x as Raw)
    : fail(`${what} is not a record`);

function list(x: unknown, max: number, what: string): unknown[] {
  if (x === undefined) return [];
  if (!Array.isArray(x)) return fail(`${what} is not a list`);
  return x.length > max ? fail(`too many ${what} (more than ${max})`) : x;
}

// The two ids this app makes: a revision's (a SHA-256, in hex) and
// everything else's (a UUID). Nothing else is an id, so none can be a
// path, a link, or a key such as `__proto__`.
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (x: unknown, pattern: RegExp, what: string): string =>
  typeof x === "string" && pattern.test(x) ? x : fail(`${what} is not an id`);
const hash = (x: unknown, what: string) => id(x, HASH, what);
const uuid = (x: unknown, what: string) => id(x, UUID, what);
/** A reference to an entry of either kind. */
const either = (x: unknown, what: string): string =>
  typeof x === "string" && (HASH.test(x) || UUID.test(x))
    ? x
    : fail(`${what} is not an id`);

const oneOf = <T extends string>(
  x: unknown,
  values: readonly T[],
  what: string,
): T => (values.includes(x as T) ? (x as T) : fail(`${what} is not known`));

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const address = (x: unknown) =>
  typeof x === "string" && ADDRESS.test(x)
    ? (x as `0x${string}`)
    : fail("an address is not one");

const SOURCES = [
  "user",
  "assistant",
  "import",
  "load",
  "revert",
  "merge",
] as const;
const STATUSES = [
  "running",
  "paused",
  "watching",
  "success",
  "error",
  "cancelled",
  "interrupted",
] as const;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const CID = /^[A-Za-z0-9]{1,128}$/;

/** What the host brings to the check. */
export interface ImportRules<Console> {
  /** The host's check of its own console state: returns it rebuilt, with
   *  nothing live in it, or throws. */
  console(raw: unknown): Console;
  /** How many characters a console it returned holds: counted in the
   *  export's total and in the run's size. Nothing, when left out. */
  consoleSize?(console: Console): number;
  /** The host's rule for a line shown to people and handed to a model:
   *  no line breaks, no control or invisible characters. The same one its
   *  own explanations go through. */
  plain(text: string): string;
  now: number;
}

/**
 * The timeline of an export, checked and made safe to keep. Throws
 * `MalformedExport` for anything that is not exactly what this version
 * writes: the caller applies nothing of an export that fails.
 *
 * What comes back differs from what was said, so that a record from
 * outside cannot pass for something it is not:
 *  - only known fields are kept, and every entry and run is marked
 *    `unverified`, whatever it said of that itself;
 *  - an id is an id this app makes (a revision's hash, a UUID), so none
 *    is a path, a link or the name of something else;
 *  - a short text (an explanation, an agent's name) is one plain line,
 *    clamped to the length a local one may have;
 *  - no time is later than `now`;
 *  - no run is unfinished: one that was is interrupted;
 *  - it holds no removal. A removal is keyed by an entry's id, and a
 *    revision's id can be worked out ahead of time, so a removal from a
 *    link could delete what this copy has, or keep the user's later
 *    revisions from ever being recorded. The export's removals are applied
 *    to the export's own entries and runs (it cannot bring what it
 *    declares removed) and are not kept. Removals that travel are signed
 *    ones, in a later piece;
 *  - links made elsewhere (`share` entries) are checked and left out: an
 *    entry saying "this revision is at this link" cannot be verified
 *    without fetching the link, and Copy link would hand it on as the
 *    user's. Until entries are signed, a link is only kept where it was
 *    made.
 */
export function parseTimeline<Console>(
  raw: unknown,
  { console, consoleSize, plain, now }: ImportRules<Console>,
): CheckedTimeline {
  // All the text kept, together.
  let kept = 0;
  const text = (x: unknown, max: number, what: string): string => {
    if (typeof x !== "string") return fail(`${what} is not text`);
    if (x.length > max) return fail(`${what} is too long`);
    kept += x.length;
    return kept > IMPORT_LIMITS.total
      ? fail("it holds too much text for a link")
      : x;
  };
  const line = (x: unknown, max: number, what: string): string => {
    if (typeof x !== "string") return fail(`${what} is not text`);
    // Bounded before the rule runs over it, clamped after.
    return text(plain(x.slice(0, max * 10)).slice(0, max), max, what);
  };
  const author = (x: unknown): Author => {
    const raw = record(x, "an author");
    switch (raw.kind) {
      case "user":
        return raw.address === undefined
          ? { kind: "user" }
          : { kind: "user", address: address(raw.address) };
      case "assistant":
        return { kind: "assistant" };
      case "agent":
        return {
          kind: "agent",
          address: address(raw.address),
          ...(raw.name === undefined
            ? {}
            : { name: line(raw.name, IMPORT_LIMITS.name, "a name") }),
        };
      default:
        return fail("an author is not known");
    }
  };
  const time = (x: unknown): number =>
    typeof x === "number" && Number.isFinite(x) && x >= 0
      ? Math.min(x, now)
      : fail("a time is not one");

  /** The mark of what an export brings, with the characters counted
   *  since `from`. */
  const taken = (from: number) =>
    ({ unverified: true, intake: { at: now, size: kept - from } }) as const;
  const count = (size: number) => {
    kept += size;
    if (kept > IMPORT_LIMITS.total) fail("it holds too much text for a link");
  };

  const entry = (x: unknown): TimelineEntry[] => {
    const e = record(x, "an entry");
    const from = kept;
    const base = { ts: time(e.ts), author: author(e.author) };
    switch (e.kind) {
      case "revision": {
        const script = text(e.text, IMPORT_LIMITS.script, "a script");
        // What a revision follows: another revision, or the clearing of
        // the timeline it starts again from.
        const parent =
          e.parent === undefined ? undefined : either(e.parent, "a parent");
        if (e.id !== revisionId(script, parent))
          return fail("a revision is not what its id says");
        const revision: RevisionEntry = {
          kind: "revision",
          id: hash(e.id, "a revision's id"),
          ...base,
          text: script,
          source: oneOf(e.source, SOURCES, "a revision's source"),
          ...(parent === undefined ? {} : { parent }),
          ...(e.summary === undefined
            ? {}
            : { summary: line(e.summary, IMPORT_LIMITS.summary, "a summary") }),
          ...(e.from === undefined
            ? {}
            : { from: hash(e.from, "a reference") }),
          ...(e.origin === undefined
            ? {}
            : {
                origin: {
                  cid: id(record(e.origin, "an origin").cid, CID, "a CID"),
                },
              }),
          ...(e.contributors === undefined
            ? {}
            : {
                contributors: list(e.contributors, 100, "contributors").map(
                  author,
                ),
              }),
        };
        return [{ ...revision, ...taken(from) }];
      }
      case "run": {
        const runId = uuid(e.id, "a run's id");
        if (e.runId !== runId) return fail("a run entry is not its run's");
        return [{ kind: "run", id: runId, ...base, runId, ...taken(from) }];
      }
      case "cleared":
        // An account of a clearing of another copy: checked, not kept.
        uuid(e.id, "an entry's id");
        return [];
      case "share":
        uuid(e.id, "an entry's id");
        hash(e.revisionId, "a shared revision");
        id(e.cid, CID, "a CID");
        if (typeof e.key !== "string" || !KEY.test(e.key))
          return fail("a link's key is not one");
        return [];
      default:
        return fail("an entry is of a kind this version does not know");
    }
  };

  const run = (x: unknown): RunRecord => {
    const r = record(x, "a run");
    const from = kept;
    const status = oneOf(r.status, STATUSES, "a run's status");
    const updatedAt = time(r.updatedAt);
    const unfinished = UNFINISHED.includes(status);
    const endedAt = r.endedAt === undefined ? undefined : time(r.endedAt);
    let checked: Console;
    try {
      checked = console(r.console);
    } catch {
      return fail("a run's console is not one");
    }
    count(consoleSize?.(checked) ?? 0);
    const checkedRun: RunRecord = {
      id: uuid(r.id, "a run's id"),
      revisionId:
        r.revisionId === "" ? "" : hash(r.revisionId, "a run's revision"),
      mode: oneOf(r.mode, ["real", "simulated"] as const, "a run's mode"),
      status: unfinished ? "interrupted" : status,
      startedAt: time(r.startedAt),
      ...(unfinished
        ? { endedAt: endedAt ?? updatedAt }
        : endedAt === undefined
          ? {}
          : { endedAt }),
      by: author(r.by),
      console: checked,
      errors: list(r.errors, 1_000, "errors").map((error) =>
        text(error, IMPORT_LIMITS.error, "an error"),
      ),
      output: text(r.output, IMPORT_LIMITS.output, "a run's output"),
      executedCount:
        typeof r.executedCount === "number" &&
        Number.isSafeInteger(r.executedCount) &&
        r.executedCount >= 0
          ? r.executedCount
          : fail("a count is not one"),
      updatedAt,
    };
    return { ...checkedRun, ...taken(from) };
  };

  /** The id a removal names. Who removed and when is not kept. */
  const removed = (x: unknown): string => {
    const r = record(x, "a removal");
    author(r.by);
    time(r.ts);
    return either(r.entryId, "a removed entry's id");
  };

  // How much there is, before any of it is read: an export with too many
  // records is refused on three comparisons.
  const timeline = record(raw, "the timeline");
  const entries = list(timeline.entries, IMPORT_LIMITS.entries, "entries");
  const runs = list(timeline.runs, IMPORT_LIMITS.runs, "runs");
  const removals = list(timeline.removals, IMPORT_LIMITS.removals, "removals");
  // The removals first: what the export declares removed is not read
  // further (so not hashed), and does not arrive. They are then dropped:
  // see `CheckedTimeline`.
  const gone = new Set(removals.map(removed));
  const there = (x: unknown) => !gone.has(record(x, "a record").id as string);
  return {
    entries: entries.filter(there).flatMap(entry),
    runs: runs.filter(there).map(run),
  } as CheckedTimeline;
}

/** How many revisions, and how many runs, a space keeps of what exports
 *  brought, all exports together. Their characters together are bounded
 *  too, by `IMPORT_LIMITS.total`. */
export const MAX_UNVERIFIED = 300;

/**
 * What of a checked export a copy of the space takes in: the one rule for
 * every way an export arrives, into a browser that has the space
 * (`local`) or one that does not (an empty `local`).
 *
 * It adds the export's records this copy does not have: its latest
 * revisions and its latest runs (each with its entry), up to
 * `MAX_UNVERIFIED` of each. A run this copy has keeps its record.
 *
 * What exports bring lives in an allowance of its own, and the bound is
 * on what the space holds afterwards, however many exports were opened:
 * at most `MAX_UNVERIFIED` unverified revisions, as many unverified runs,
 * and `IMPORT_LIMITS.total` characters between them. When a new import
 * needs room, the unverified records this browser took in longest ago
 * give way (`forget`: no removal is left, so they can come again). So:
 *  - an import is never refused for what earlier imports left;
 *  - "longest ago" is by `intake.at`, written here, never by a time an
 *    export gave;
 *  - nothing recorded here ever counts, gives way, or is replaced.
 * There is no removal to take: a checked timeline holds none.
 */
export function mergeable(
  local: TimelineState,
  incoming: CheckedTimeline,
): TimelinePatch {
  type Sized = { id: string; intake?: { at: number; size: number } };
  const size = (records: Sized[]) =>
    records.reduce((total, record) => total + (record.intake?.size ?? 0), 0);
  const blocked = (id: string) => local.removals.has(id);
  /** The export's latest, as many as a space keeps. */
  const latest = <T>(records: T[], at: (record: T) => number) =>
    [...records]
      .sort((a, b) => at(b) - at(a))
      .slice(0, MAX_UNVERIFIED)
      .reverse();

  const revisions = latest(
    incoming.entries.filter(
      (entry) =>
        entry.kind === "revision" &&
        !local.entries.has(entry.id) &&
        !blocked(entry.id),
    ),
    (entry) => entry.ts,
  );
  const runs = latest(
    incoming.runs.filter((run) => !local.runs.has(run.id) && !blocked(run.id)),
    (run) => run.startedAt,
  );
  const arriving = new Set(runs.map((run) => run.id));
  const runEntries = incoming.entries.filter(
    (entry) =>
      entry.kind === "run" &&
      arriving.has(entry.id) &&
      !local.entries.has(entry.id),
  );

  // What is held of earlier imports, longest held first.
  const oldestFirst = <T extends Sized>(records: T[]) =>
    records.sort((a, b) => (a.intake?.at ?? 0) - (b.intake?.at ?? 0));
  const heldRevisions = oldestFirst(
    [...local.entries.values()].filter(
      (entry) => entry.kind === "revision" && entry.unverified,
    ),
  );
  const heldRuns = oldestFirst(
    [...local.runs.values()].filter((run) => run.unverified),
  );
  const forget: string[] = [];
  const giveWay = (held: Sized[]) => {
    const record = held.shift();
    if (record) forget.push(record.id);
  };
  while (heldRevisions.length + revisions.length > MAX_UNVERIFIED)
    giveWay(heldRevisions);
  while (heldRuns.length + runs.length > MAX_UNVERIFIED) giveWay(heldRuns);
  const total = () =>
    size(heldRevisions) + size(heldRuns) + size(revisions) + size(runs);
  while (
    total() > IMPORT_LIMITS.total &&
    heldRevisions.length + heldRuns.length
  )
    giveWay(
      (heldRevisions[0]?.intake?.at ?? Number.POSITIVE_INFINITY) <=
        (heldRuns[0]?.intake?.at ?? Number.POSITIVE_INFINITY)
        ? heldRevisions
        : heldRuns,
    );

  return { forget, entries: [...revisions, ...runEntries], runs };
}
