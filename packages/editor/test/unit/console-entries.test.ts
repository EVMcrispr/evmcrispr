import { describe, expect, it } from "bun:test";
import type { BoxSnapshot } from "@evmcrispr/sdk";
import {
  CONSOLE_LIMITS,
  consoleEntries,
  consoleSize,
  emptyConsole,
  parseConsole,
  reduceConsole,
} from "../../src/console/entries";

const snap = (over: Partial<BoxSnapshot>): BoxSnapshot => ({
  id: "b1",
  state: "live",
  title: "T",
  detail: "d",
  history: [],
  simulated: false,
  ...over,
});

describe("console entries", () => {
  it("keeps plain lines in order and drops box-tagged lines", () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "hello" });
    s = reduceConsole(s, { kind: "box", snapshot: snap({}) });
    s = reduceConsole(s, { kind: "line", text: "T: d", box: "b1" });
    s = reduceConsole(s, { kind: "line", text: "bye" });
    expect(
      consoleEntries(s).map((e) => (e.kind === "line" ? e.text : e.box.id)),
    ).toEqual(["hello", "b1", "bye"]);
  });

  it("keeps a box-tagged line as plain text when its box never arrived", () => {
    // Hosts that wire `onLog` but not `onBox` still see box updates.
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "Tx: Sent", box: "b9" });
    s = reduceConsole(s, { kind: "line", text: "Tx: Confirmed", box: "b9" });
    expect(
      consoleEntries(s).map((e) => (e.kind === "line" ? e.text : e.box.id)),
    ).toEqual(["Tx: Sent", "Tx: Confirmed"]);
  });

  it("updates a box in place", () => {
    let s = reduceConsole(emptyConsole, { kind: "box", snapshot: snap({}) });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ detail: "1/4", history: ["d"] }),
    });
    const [entry] = consoleEntries(s);
    expect(entry.kind === "box" && entry.box.detail).toBe("1/4");
  });

  it("keeps boxes flat, in the order they opened, whatever carries them", () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "first" });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "twap", title: "TWAP" }),
    });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "safe", title: "Safe tx" }),
    });
    // The TWAP learns its carrier: that orders endings, not the layout.
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "twap", title: "TWAP", parent: "safe" }),
    });
    expect(
      consoleEntries(s).map((e) => (e.kind === "line" ? e.text : e.box.id)),
    ).toEqual(["first", "twap", "safe"]);
  });

  it("counts live boxes", () => {
    let s = reduceConsole(emptyConsole, { kind: "box", snapshot: snap({}) });
    expect(s.live).toBe(1);
    s = reduceConsole(s, { kind: "box", snapshot: snap({ state: "done" }) });
    expect(s.live).toBe(0);
  });

  it("ends every live box when the run dies, keeping ended ones", () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "box", snapshot: snap({ id: "a" }) });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "b", state: "done", detail: "Executed" }),
    });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({ id: "c", simulated: true }),
    });
    s = reduceConsole(s, { kind: "end-live", detail: "Stopped following" });
    expect(s.live).toBe(0);
    expect(s.boxes.a).toMatchObject({
      state: "cancelled",
      detail: "Stopped following",
      history: ["d"],
    });
    expect(s.boxes.c.state).toBe("cancelled");
    expect(s.boxes.b).toMatchObject({ state: "done", detail: "Executed" });
    expect(s.slots).toHaveLength(3);
  });
});

describe("a live console is bounded where it grows", () => {
  const lines = (s: ReturnType<typeof reduceConsole>) =>
    consoleEntries(s).flatMap((e) => (e.kind === "line" ? [e.text] : []));

  it("many small lines: the oldest go, and a marker says so", () => {
    let s = emptyConsole;
    const line = "x".repeat(1_000);
    const count = CONSOLE_LIMITS.total / 1_000 + 50;
    for (let i = 0; i < count; i++)
      s = reduceConsole(s, { kind: "line", text: `${i} ${line}` });
    expect(consoleSize(s)).toBeLessThanOrEqual(CONSOLE_LIMITS.total);
    expect(s.dropped).toBeGreaterThanOrEqual(50);
    const shown = lines(s);
    expect(shown[0]).toMatch(/earlier output dropped/i);
    expect(shown.at(-1)?.startsWith(`${count - 1} `)).toBe(true);
    expect(shown.some((text) => text.startsWith("0 "))).toBe(false);
  });

  it("one huge line is cut to the length of a line", () => {
    const s = reduceConsole(emptyConsole, {
      kind: "line",
      text: "x".repeat(CONSOLE_LIMITS.total * 2),
    });
    expect(consoleSize(s)).toBeLessThanOrEqual(CONSOLE_LIMITS.line + 100);
    expect(lines(s)[0]).toMatch(/cut$/);
  });

  it("one box with a huge history, detail, steps and links keeps a bounded part", () => {
    const s = reduceConsole(emptyConsole, {
      kind: "box",
      snapshot: snap({
        title: "t".repeat(10_000),
        detail: "d".repeat(CONSOLE_LIMITS.line * 3),
        history: Array.from(
          { length: 5_000 },
          (_, i) => `${i} ${"h".repeat(50_000)}`,
        ),
        steps: Array.from({ length: 5_000 }, () => ({
          state: "done" as const,
        })),
        links: Object.fromEntries(
          Array.from({ length: 500 }, (_, i) => [
            `l${i}`,
            `https://x.test/${"p".repeat(50_000)}`,
          ]),
        ),
      }),
    });
    const box = s.boxes.b1;
    expect(box.title.length).toBeLessThanOrEqual(CONSOLE_LIMITS.title + 10);
    expect(box.detail.length).toBeLessThanOrEqual(CONSOLE_LIMITS.line + 10);
    expect(box.history.length).toBeLessThanOrEqual(CONSOLE_LIMITS.history);
    // The latest of its history is what is kept.
    expect(box.history.at(-1)?.startsWith("4999 ")).toBe(true);
    expect(box.steps?.length).toBeLessThanOrEqual(CONSOLE_LIMITS.steps);
    expect(Object.keys(box.links ?? {}).length).toBeLessThanOrEqual(
      CONSOLE_LIMITS.links,
    );
    expect(consoleSize(s)).toBeLessThanOrEqual(CONSOLE_LIMITS.box + 1_000);
  });

  it("boxes count toward the total: finished ones go with the oldest lines, live ones stay", () => {
    let s = reduceConsole(emptyConsole, {
      kind: "box",
      snapshot: snap({ id: "live", detail: "going" }),
    });
    for (let i = 0; i < 400; i++)
      s = reduceConsole(s, {
        kind: "box",
        snapshot: snap({
          id: `b${i}`,
          state: "done",
          detail: "d".repeat(CONSOLE_LIMITS.line),
        }),
      });
    expect(consoleSize(s)).toBeLessThanOrEqual(CONSOLE_LIMITS.total);
    expect(s.boxes.live).toBeDefined();
    expect(s.boxes.b0).toBeUndefined();
    expect(s.boxes.b399).toBeDefined();
    expect(s.live).toBe(1);
    expect(s.dropped).toBeGreaterThan(0);
  });

  it("the size kept is the size there is", () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "hello" });
    s = reduceConsole(s, { kind: "box", snapshot: snap({}) });
    s = reduceConsole(s, { kind: "box", snapshot: snap({ detail: "longer" }) });
    const { size: _, ...rest } = s;
    expect(s.size).toBe(consoleSize(rest));
  });
});

describe("parseConsole", () => {
  const made = () => {
    let s = emptyConsole;
    s = reduceConsole(s, { kind: "line", text: "hello" });
    s = reduceConsole(s, {
      kind: "box",
      snapshot: snap({
        parent: "p",
        links: { tx: "https://example.org/tx/1" },
        progress: [1, 2],
        steps: [
          { state: "done", href: "https://example.org/a", current: true },
          { state: "pending" },
        ],
        countdown: { label: "Next", from: 1, until: 2, segment: 1 },
      }),
    });
    return s;
  };
  const raw = () => structuredClone(made()) as unknown as Record<string, any>;

  it("a state made elsewhere comes back with nothing live, no link and nothing that ticks", () => {
    const parsed = parseConsole(raw(), "Not followed here");
    expect(parsed.live).toBe(0);
    expect(parsed.unverified).toBe(true);
    expect(parsed.slots).toEqual(made().slots);
    // Every entry of it says so, whoever draws it.
    expect(consoleEntries(parsed).every((e) => e.unverified === true)).toBe(
      true,
    );
    expect(consoleEntries(made()).some((e) => e.unverified)).toBe(false);
    // And it stays so through anything done to it later.
    expect(reduceConsole(parsed, { kind: "line", text: "x" }).unverified).toBe(
      true,
    );
    expect(
      reduceConsole(parsed, { kind: "box", snapshot: snap({ id: "n" }) })
        .unverified,
    ).toBe(true);
    expect(parsed.boxes.b1).toEqual({
      id: "b1",
      parent: "p",
      state: "cancelled",
      title: "T",
      detail: "Not followed here",
      history: ["d"],
      progress: [1, 2],
      steps: [{ state: "done" }, { state: "pending" }],
      simulated: false,
    });
  });

  it("only known fields are kept", () => {
    const state = raw();
    state.extra = 1;
    state.boxes.b1.extra = 1;
    state.slots[0].extra = 1;
    expect(JSON.stringify(parseConsole(state, "x"))).not.toContain("extra");
  });

  it("refuses what is not a console state, or is more than one holds", () => {
    const broken: ((s: Record<string, any>) => void)[] = [
      (s) => {
        s.slots = {};
      },
      (s) => {
        s.slots.push({ kind: "box", id: "missing" });
      },
      (s) => {
        s.slots.push({ kind: "box", id: "constructor" });
      },
      (s) => {
        s.slots[0].text = 1;
      },
      (s) => {
        s.slots[0].text = "x".repeat(CONSOLE_LIMITS.line + 1);
      },
      (s) => {
        s.slots = Array.from({ length: CONSOLE_LIMITS.slots + 1 }, () => ({
          kind: "line",
          text: "",
        }));
      },
      (s) => {
        s.slots = Array.from({ length: 100 }, () => ({
          kind: "line",
          text: "x".repeat(CONSOLE_LIMITS.line),
        }));
      },
      (s) => {
        s.boxes.b1.history = Array.from({ length: 150 }, () =>
          "h".repeat(CONSOLE_LIMITS.line),
        );
      },
      (s) => {
        s.boxes.b1.id = "other";
      },
      (s) => {
        s.boxes.b1.state = "exploded";
      },
      (s) => {
        s.boxes.b1.history = "none";
      },
      (s) => {
        s.boxes.b1.progress = [1];
      },
      (s) => {
        s.boxes.b1.progress = [5, 2];
      },
      (s) => {
        s.boxes.b1.progress = [1, 1e9];
      },
      (s) => {
        s.boxes.b1.steps = Array.from({ length: 5000 }, () => ({
          state: "done",
        }));
      },
      (s) => {
        s.boxes.b1.steps[0].state = "odd";
      },
      (s) => {
        s.boxes.b1.parent = 7;
      },
    ];
    for (const breakIt of broken) {
      const state = raw();
      breakIt(state);
      expect(() => parseConsole(state, "x")).toThrow();
    }
    expect(() => parseConsole(null, "x")).toThrow();
    expect(() => parseConsole([], "x")).toThrow();
    expect(() =>
      parseConsole(JSON.parse('{"slots":[],"boxes":{"__proto__":{}}}'), "x"),
    ).toThrow();
  });
});
