import type { BoxCountdown } from "@evmcrispr/sdk";
import { useEffect, useState } from "react";

/** "30s", "4m 12s", "2h 05m", "3d 4h": the two most significant units. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400)
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

const DUE: Record<string, string> = {
  "Starts in": "Starting now",
  "Next part in": "Next part due now",
  "Ends in": "Ending now",
};

/** "Next part in 4m 12s", or what is due once the time has come (the box
 *  updates on its next poll). */
export function countdownText(countdown: BoxCountdown, now: number): string {
  const left = countdown.until - now;
  if (left > 0) return `${countdown.label} ${formatDuration(left)}`;
  return DUE[countdown.label] ?? `${countdown.label.replace(/ in$/, "")} now`;
}

export type Segment =
  | { kind: "done" }
  | { kind: "upcoming"; fill: number }
  | { kind: "pending" };

/** Past this many steps, segments get too thin to read: the host falls
 *  back to a continuous bar. */
export const MAX_SEGMENTS = 48;

/** One segment per step. The first `done` are full, matching the box's
 *  "N/M" text. The step the countdown leads to (the one after
 *  `countdown.segment`, when "Next part in") fills faintly with time until
 *  it opens; every other unfinished step is empty. A finished step is full
 *  whatever the clock says. */
export function segments(
  [done, total]: [number, number],
  countdown: BoxCountdown,
  now: number,
): Segment[] | null {
  if (countdown.segment === undefined || total <= 0 || total > MAX_SEGMENTS)
    return null;
  // "Starts in" leads to step 0 itself; "Next part in" to the following
  // step; "Ends in" to no step.
  const next =
    countdown.label === "Starts in"
      ? countdown.segment
      : countdown.label === "Next part in"
        ? countdown.segment + 1
        : undefined;
  return Array.from({ length: total }, (_, i): Segment => {
    if (i < done) return { kind: "done" };
    if (i !== next) return { kind: "pending" };
    const span = countdown.until - countdown.from;
    const fill = span > 0 ? (now - countdown.from) / span : 0;
    return { kind: "upcoming", fill: Math.min(1, Math.max(0, fill)) };
  });
}

/** The current Unix time in seconds, re-rendering every second while
 *  `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now() / 1000);
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
