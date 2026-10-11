import type { BoxSnapshot, BoxState, BoxStep } from "@evmcrispr/sdk";

/** `unverified`: the entry is of a console that arrived from outside (see
 *  `parseConsole`). Whoever draws it shows its text as text. */
export type ConsoleEntry =
  | { kind: "line"; text: string; unverified?: true }
  | { kind: "box"; box: BoxSnapshot; unverified?: true };

type Slot = { kind: "line"; text: string } | { kind: "box"; id: string };

export interface ConsoleState {
  slots: Slot[];
  boxes: Record<string, BoxSnapshot>;
  live: number;
  /** `consoleSize` of this state, kept as it changes. Absent on a state
   *  stored before sizes were kept: it is measured then. */
  size?: number;
  /** How many of the oldest entries were let go to stay within
   *  `CONSOLE_LIMITS.total`. */
  dropped?: number;
  /** The state arrived from outside this browser: set by `parseConsole`
   *  and by nothing else, and carried by every entry read from it. */
  unverified?: true;
}

export type ConsoleEvent =
  | { kind: "line"; text: string; box?: string }
  | { kind: "box"; snapshot: BoxSnapshot }
  /** The run died without ending its boxes (e.g. its worker was killed):
   *  every box still live ends cancelled with `detail`. */
  | { kind: "end-live"; detail: string };

export const emptyConsole: ConsoleState = { slots: [], boxes: {}, live: 0 };

/**
 * What a console may hold. A console is a record that is written to
 * storage as it grows and can be printed to in a loop, so its size is the
 * total of every character it keeps, and that total is what is capped:
 * where it grows for a console of this page (`reduceConsole` lets the
 * oldest entries go), and outright for one from outside (`parseConsole`
 * refuses it).
 */
export const CONSOLE_LIMITS = {
  /** Characters of all it keeps, together (`consoleSize`). */
  total: 1_000_000,
  /** Characters of one box: its title, detail, history, links. */
  box: 200_000,
  /** Characters of a log line, of a box's detail, of a line of its
   *  history. */
  line: 20_000,
  title: 500,
  history: 200,
  steps: 200,
  links: 20,
  /** Characters of a link's address. */
  href: 2_000,
  slots: 5_000,
  boxes: 1_000,
} as const;

const sum = (texts: readonly string[]) =>
  texts.reduce((total, text) => total + text.length, 0);

function boxSize(box: BoxSnapshot): number {
  return (
    box.id.length +
    (box.parent?.length ?? 0) +
    box.title.length +
    box.detail.length +
    sum(box.history) +
    sum(Object.entries(box.links ?? {}).flat()) +
    sum((box.steps ?? []).map((step) => step.href ?? "")) +
    (box.steps?.length ?? 0) +
    (box.countdown
      ? box.countdown.label.length + (box.countdown.due?.length ?? 0)
      : 0)
  );
}

/** Everything a console state keeps, in characters (a step counts one). */
export function consoleSize(state: ConsoleState): number {
  return (
    sum(state.slots.map((slot) => (slot.kind === "line" ? slot.text : ""))) +
    Object.values(state.boxes).reduce((total, box) => total + boxSize(box), 0)
  );
}

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}… cut` : text;

/** A box as a console of this page keeps it: every part of it within its
 *  limit, the latest of its history kept when there is too much. */
function boundBox(box: BoxSnapshot): BoxSnapshot {
  const bounded: BoxSnapshot = {
    ...box,
    title: cut(box.title, CONSOLE_LIMITS.title),
    detail: cut(box.detail, CONSOLE_LIMITS.line),
    history: box.history
      .slice(-CONSOLE_LIMITS.history)
      .map((line) => cut(line, CONSOLE_LIMITS.line)),
    ...(box.links
      ? {
          links: Object.fromEntries(
            Object.entries(box.links)
              .filter(([, href]) => href.length <= CONSOLE_LIMITS.href)
              .slice(0, CONSOLE_LIMITS.links)
              .map(([label, href]) => [cut(label, CONSOLE_LIMITS.title), href]),
          ),
        }
      : {}),
    ...(box.steps
      ? {
          steps: box.steps
            .slice(0, CONSOLE_LIMITS.steps)
            .map((step) =>
              step.href && step.href.length > CONSOLE_LIMITS.href
                ? { state: step.state, current: step.current }
                : step,
            ),
        }
      : {}),
  };
  let size = boxSize(bounded);
  let from = 0;
  while (size > CONSOLE_LIMITS.box && from < bounded.history.length)
    size -= bounded.history[from++].length;
  return from ? { ...bounded, history: bounded.history.slice(from) } : bounded;
}

/** Lets the oldest entries go until the state is within the total:
 *  lines and boxes that have ended first, anything after that. */
function withinTotal(state: ConsoleState, size: number): ConsoleState {
  if (
    size <= CONSOLE_LIMITS.total &&
    state.slots.length <= CONSOLE_LIMITS.slots
  )
    return { ...state, size };
  const boxes = { ...state.boxes };
  const gone = new Set<number>();
  const over = () =>
    size > CONSOLE_LIMITS.total ||
    state.slots.length - gone.size > CONSOLE_LIMITS.slots;
  for (const sparing of [true, false]) {
    for (let i = 0; i < state.slots.length - 1 && over(); i++) {
      const slot = state.slots[i];
      if (gone.has(i)) continue;
      if (slot.kind === "line") size -= slot.text.length;
      else if (sparing && boxes[slot.id].state === "live") continue;
      else {
        size -= boxSize(boxes[slot.id]);
        delete boxes[slot.id];
      }
      gone.add(i);
    }
  }
  return {
    ...state,
    slots: state.slots.filter((_, i) => !gone.has(i)),
    boxes,
    live: Object.values(boxes).filter((b) => b.state === "live").length,
    size,
    dropped: (state.dropped ?? 0) + gone.size,
  };
}

/** Lines tagged with a known box id are dropped: the box itself shows them.
 *  Core emits a box's snapshot before its tagged line, so a tagged line whose
 *  box never arrived comes from a host without `onBox` and stays as text.
 *  The state stays within `CONSOLE_LIMITS` whatever is fed to it. */
export function reduceConsole(
  state: ConsoleState,
  event: ConsoleEvent,
): ConsoleState {
  const size = state.size ?? consoleSize(state);
  if (event.kind === "line") {
    if (event.box && Object.hasOwn(state.boxes, event.box)) return state;
    const text = cut(event.text, CONSOLE_LIMITS.line);
    return withinTotal(
      { ...state, slots: [...state.slots, { kind: "line", text }] },
      size + text.length,
    );
  }
  if (event.kind === "end-live") {
    if (state.live === 0) return state;
    const boxes = Object.fromEntries(
      Object.entries(state.boxes).map(([id, box]) => [
        id,
        box.state === "live"
          ? boundBox({
              ...box,
              state: "cancelled" as const,
              detail: event.detail,
              history:
                box.detail && box.detail !== event.detail
                  ? [...box.history, box.detail]
                  : box.history,
            })
          : box,
      ]),
    );
    const next = { ...state, boxes, live: 0 };
    return withinTotal(next, consoleSize(next));
  }
  const snapshot = boundBox(event.snapshot);
  const known = Object.hasOwn(state.boxes, snapshot.id)
    ? state.boxes[snapshot.id]
    : undefined;
  const boxes = { ...state.boxes, [snapshot.id]: snapshot };
  const slots = known
    ? state.slots
    : [...state.slots, { kind: "box" as const, id: snapshot.id }];
  const live = Object.values(boxes).filter((b) => b.state === "live").length;
  return withinTotal(
    { ...state, slots, boxes, live },
    size - (known ? boxSize(known) : 0) + boxSize(snapshot),
  );
}

/** Entries in the order they first appeared, after a line that says so
 *  when earlier ones were let go. Boxes stay flat: a box's `parent` (the
 *  transaction or proposal carrying it) decides which box ends after
 *  which, and is not shown. */
export function consoleEntries(state: ConsoleState): ConsoleEntry[] {
  const mark = state.unverified ? ({ unverified: true } as const) : {};
  const entries = state.slots.map(
    (slot): ConsoleEntry =>
      slot.kind === "line"
        ? { kind: "line", text: slot.text, ...mark }
        : { kind: "box", box: state.boxes[slot.id], ...mark },
  );
  return state.dropped
    ? [
        {
          kind: "line",
          text: `Earlier output dropped (${state.dropped} ${state.dropped === 1 ? "entry" : "entries"}): the console keeps the latest.`,
          ...mark,
        },
        ...entries,
      ]
    : entries;
}

const BOX_STATES: readonly BoxState[] = ["live", "done", "failed", "cancelled"];
const STEP_STATES: readonly BoxStep["state"][] = [
  "done",
  "missed",
  "open",
  "pending",
];

/**
 * A console state that was not made by this page: the one in a run record
 * that arrived from outside (an export). It is checked field by field and
 * rebuilt from the fields known here. Throws when it is not a console
 * state, or holds more than `CONSOLE_LIMITS` allows: each count is checked
 * before what it counts is read, and the total as it accumulates. What comes back is a record of something
 * that happened elsewhere and that nobody here follows, so:
 *  - nothing in it is live: every box still live ends cancelled with
 *    `detail`;
 *  - it holds no link (`links`, a step's `href`): where one led is the
 *    export's word;
 *  - nothing in it ticks or marks a present moment (`countdown`, a step's
 *    `current`).
 * The state is marked `unverified`, and so is every entry read from it:
 * its text is someone else's, and is shown as text.
 */
export function parseConsole(raw: unknown, detail: string): ConsoleState {
  const fail = (): never => {
    throw new Error("Not a console state");
  };
  type Raw = Record<string, unknown>;
  const record = (x: unknown): Raw =>
    typeof x === "object" && x !== null && !Array.isArray(x)
      ? (x as Raw)
      : fail();
  const list = (x: unknown, max: number): unknown[] =>
    Array.isArray(x) && x.length <= max ? x : fail();
  let kept = 0;
  const text = (x: unknown, max: number): string => {
    if (typeof x !== "string" || x.length > max) return fail();
    kept += x.length;
    return kept > CONSOLE_LIMITS.total ? fail() : x;
  };
  /** Only the fields that are there. */
  const defined = <T extends object>(fields: T): T =>
    Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ) as T;

  const progress = (x: unknown): [number, number] => {
    const [done, total, ...rest] = list(x, 2);
    const whole = (n: unknown): n is number =>
      typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
    return whole(done) && whole(total) && done <= total && total <= 100_000
      ? rest.length === 0
        ? [done, total]
        : fail()
      : fail();
  };
  const step = (x: unknown): BoxStep => {
    const { state } = record(x);
    return STEP_STATES.includes(state as BoxStep["state"])
      ? { state: state as BoxStep["state"] }
      : fail();
  };
  const box = (id: string, x: unknown): BoxSnapshot => {
    const b = record(x);
    if (b.id !== id) fail();
    const before = kept;
    const checked = defined({
      id: text(id, CONSOLE_LIMITS.title),
      parent:
        b.parent === undefined
          ? undefined
          : text(b.parent, CONSOLE_LIMITS.title),
      state: BOX_STATES.includes(b.state as BoxState)
        ? (b.state as BoxState)
        : fail(),
      title: text(b.title, CONSOLE_LIMITS.title),
      detail: text(b.detail, CONSOLE_LIMITS.line),
      history: list(b.history, CONSOLE_LIMITS.history).map((line) =>
        text(line, CONSOLE_LIMITS.line),
      ),
      progress: b.progress === undefined ? undefined : progress(b.progress),
      steps:
        b.steps === undefined
          ? undefined
          : list(b.steps, CONSOLE_LIMITS.steps).map(step),
      simulated: typeof b.simulated === "boolean" ? b.simulated : fail(),
    });
    return kept - before > CONSOLE_LIMITS.box ? fail() : checked;
  };

  const state = record(raw);
  const named = Object.entries(record(state.boxes));
  if (named.length > CONSOLE_LIMITS.boxes) fail();
  // A map with no prototype: a box is found only if the state holds it.
  const boxes: Record<string, BoxSnapshot> = Object.create(null);
  for (const [id, x] of named) boxes[id] = box(id, x);
  const slots = list(state.slots, CONSOLE_LIMITS.slots).map((x): Slot => {
    const slot = record(x);
    if (slot.kind === "line")
      return { kind: "line", text: text(slot.text, CONSOLE_LIMITS.line) };
    if (
      slot.kind !== "box" ||
      typeof slot.id !== "string" ||
      !Object.hasOwn(boxes, slot.id)
    )
      return fail();
    return { kind: "box", id: slot.id };
  });
  const live = Object.values(boxes).filter((b) => b.state === "live").length;
  const ended = reduceConsole(
    { slots, boxes: { ...boxes }, live },
    { kind: "end-live", detail },
  );
  return { ...ended, size: consoleSize(ended), unverified: true };
}
