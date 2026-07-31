/**
 * Model-friendly local clock, in parts: weekday for relative-day reasoning,
 * ISO date to avoid day/month ambiguity, 24h time with an explicit UTC
 * offset, and the Unix timestamp so on-chain deadlines (ENS expiries,
 * vesting cliffs, locks) can be compared by subtraction instead of calendar
 * arithmetic, which the model gets wrong.
 */
function clockParts() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  return {
    weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    offset: `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`,
    unix: Math.floor(now.getTime() / 1000),
  };
}

/**
 * The clock spelled out for a system prompt. E.g. "The current date and
 * time is Tuesday, 2026-07-28 19:55 (UTC+01:00); Unix timestamp 1785268500."
 */
export function nowLine(): string {
  const { weekday, date, time, offset, unix } = clockParts();
  return `The current date and time is ${weekday}, ${date} ${time} (${offset}); Unix timestamp ${unix}.`;
}

/**
 * Terse form for a per-turn restatement: the system prompt already spells
 * the clock out, so the reminder only needs the two anchors the model
 * actually computes from — a calendar date and an epoch to subtract.
 * E.g. "[now: 2026-07-28 19:55 UTC+01:00 | 1785268500]".
 */
export function nowStamp(): string {
  const { date, time, offset, unix } = clockParts();
  return `[now: ${date} ${time} ${offset} | ${unix}]`;
}

/** Wraps a static system prompt with the current clock and a standing
 *  instruction to reason about dates from it rather than from memory.
 *  Recompute per run (call this inside the function passed as
 *  `systemPrompt` to `useChatAgent`) so long-lived sessions don't drift. */
export function withClock(systemPrompt: string): string {
  return `${systemPrompt}\n\n${nowLine()}\n\nNever reason about dates from memory. Whenever a question involves when something happens, how long until or since it, or whether something has expired or is still valid, first restate the current date and Unix timestamp above, then compute the answer relative to it. Give both the absolute date and the relative duration, e.g. "2027-03-04, about 7 months from now".`;
}
