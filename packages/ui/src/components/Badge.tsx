import type { ReactNode } from "react";
import { TONE_EDGE, TONE_FILL, TONE_TEXT, type Tone } from "../tone";
import { cn } from "../utils";
import { Dot } from "./Dot";

interface BadgeProps {
  tone?: Tone;
  /** `plain`: a status word in a meta line. `tag`: a framed label of a
   *  kind. `count`: a number. */
  variant?: "plain" | "tag" | "count";
  /** A leading dot, for a status that is still going on. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({
  tone = "neutral",
  variant = "plain",
  dot = false,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-sans text-caption",
        TONE_TEXT[tone],
        variant === "tag" && [
          "rounded-(--radius) border-2 px-1.5 font-medium",
          TONE_EDGE[tone],
          TONE_FILL[tone],
        ],
        variant === "count" && [
          "min-w-6 justify-center rounded-full border-2 px-1.5 font-medium tabular-nums",
          TONE_EDGE[tone],
          TONE_FILL[tone],
        ],
        className,
      )}
    >
      {dot && <Dot tone={tone} />}
      {children}
    </span>
  );
}
