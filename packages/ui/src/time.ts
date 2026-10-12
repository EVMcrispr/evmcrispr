/** How long ago, in the fewest words. `now` and `then` in milliseconds.
 *  A moment ahead of `now` (another device's clock) is "just now". */
export function ago(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return day(then);
}

/** A day: "Oct 11, 2026". */
export function day(time: number): string {
  return new Date(time).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A time of day, with the day when it is not today. */
export function clock(time: number, now: number): string {
  const at = new Date(time);
  const hour = at.toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return at.toDateString() === new Date(now).toDateString()
    ? hour
    : `${day(time)}, ${hour}`;
}

/** A length of time: "7 min", "2 h 5 min". */
export function duration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
