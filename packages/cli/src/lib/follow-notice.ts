import type { BoxSnapshot } from "@evmcrispr/sdk";

/** Tells the user, once, that the script has finished and the run only
 *  follows status boxes, so a silent wait does not look like a hang. */
export function followNotice(write: (line: string) => void): {
  onBox(snapshot: BoxSnapshot): void;
  onLine(line: number | null): void;
} {
  const live = new Set<string>();
  let noticed = false;
  return {
    onBox(snapshot) {
      // Simulated boxes never keep a run open.
      if (snapshot.state === "live" && !snapshot.simulated)
        live.add(snapshot.id);
      else live.delete(snapshot.id);
    },
    onLine(line) {
      if (line !== null || noticed) return;
      noticed = true;
      // After a tick: boxes that do not hold the run end right after its
      // last line, and must not be announced as followed.
      setTimeout(() => {
        if (live.size > 0)
          write(
            `Script finished; following ${live.size} status box(es). Press Ctrl-C to stop following.`,
          );
      }, 0);
    },
  };
}
