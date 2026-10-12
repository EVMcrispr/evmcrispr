import { ago, clock, day } from "../time";
import { cn } from "../utils";

interface TimeProps {
  /** The moment, in milliseconds. */
  at: number;
  format?: "relative" | "clock" | "day";
  /** The present, in milliseconds. Defaults to the time of rendering. */
  now?: number;
  className?: string;
}

/** A moment, written for reading, with the exact one on hover. */
export function Time({
  at,
  format = "relative",
  now = Date.now(),
  className,
}: TimeProps) {
  if (!Number.isFinite(at)) return null;
  const text =
    format === "relative"
      ? ago(at, now)
      : format === "clock"
        ? clock(at, now)
        : day(at);
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={new Date(at).toLocaleString("en")}
      className={cn("shrink-0 whitespace-nowrap", className)}
    >
      {text}
    </time>
  );
}
