import type { BoxCountdown, BoxStep } from "@evmcrispr/sdk";
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

/** "Next segment in 4m 12s", then the countdown's `due` text once the
 *  time has come (the box updates on its next poll). */
export function countdownText(countdown: BoxCountdown, now: number): string {
  const left = countdown.until - now;
  if (left > 0) return `${countdown.label} ${formatDuration(left)}`;
  return countdown.due ?? countdown.label;
}

export type Segment =
  | { kind: "done"; href?: string }
  | { kind: "missed" }
  | { kind: "upcoming"; fill: number }
  | { kind: "pending" };

/** Past this many steps, segments get too thin to read: the host falls
 *  back to a continuous bar. */
export const MAX_SEGMENTS = 48;

const elapsed = (countdown: BoxCountdown | undefined, now: number) => {
  if (!countdown) return 0;
  const span = countdown.until - countdown.from;
  const fill = span > 0 ? (now - countdown.from) / span : 0;
  return Math.min(1, Math.max(0, fill));
};

/** One segment per step. With per-step states (`steps`), each segment
 *  shows its own: done (linked when it has an `href`), missed, open
 *  (filling faintly with the countdown's time) or pending. Without them,
 *  the first `done` are full and the countdown's `segment` fills. */
export function segments(
  [done, total]: [number, number],
  countdown: BoxCountdown | undefined,
  now: number,
  steps?: BoxStep[],
): Segment[] | null {
  if (total <= 0 || total > MAX_SEGMENTS) return null;
  if (steps && steps.length === total)
    return steps.map((step): Segment => {
      switch (step.state) {
        case "done":
          return { kind: "done", href: step.href };
        case "missed":
          return { kind: "missed" };
        case "open":
          return { kind: "upcoming", fill: elapsed(countdown, now) };
        default:
          return { kind: "pending" };
      }
    });
  const next = countdown?.segment;
  return Array.from({ length: total }, (_, i): Segment => {
    if (i < done) return { kind: "done" };
    if (i !== next || !countdown) return { kind: "pending" };
    return { kind: "upcoming", fill: elapsed(countdown, now) };
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
