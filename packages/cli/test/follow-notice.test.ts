import { describe, expect, it } from "bun:test";
import type { BoxSnapshot } from "@evmcrispr/sdk";

import { followNotice } from "../src/lib/follow-notice";

const box = (id: string, state: BoxSnapshot["state"], simulated = false) =>
  ({
    id,
    state,
    title: "T",
    detail: "",
    history: [],
    simulated,
  }) as BoxSnapshot;

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("followNotice", () => {
  it("says once that the script finished while boxes are still followed", async () => {
    const lines: string[] = [];
    const notice = followNotice((line) => lines.push(line));
    notice.onBox(box("a", "live"));
    notice.onBox(box("b", "live"));
    notice.onBox(box("c", "live", true));
    notice.onLine(3);
    notice.onLine(null);
    notice.onLine(null);
    await tick();
    expect(lines).toEqual([
      "Script finished; following 2 status box(es). Press Ctrl-C to stop following.",
    ]);
  });

  it("stays quiet when no box outlives the script", async () => {
    const lines: string[] = [];
    const notice = followNotice((line) => lines.push(line));
    notice.onBox(box("a", "live"));
    notice.onBox(box("a", "done"));
    notice.onLine(null);
    await tick();
    expect(lines).toEqual([]);
  });

  it("does not count boxes the run ends right after its last line", async () => {
    const lines: string[] = [];
    const notice = followNotice((line) => lines.push(line));
    notice.onBox(box("a", "live"));
    notice.onLine(null);
    // A box that does not hold ends as the run finishes.
    notice.onBox(box("a", "done"));
    await tick();
    expect(lines).toEqual([]);
  });
});
