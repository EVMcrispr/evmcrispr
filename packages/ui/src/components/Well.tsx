import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

interface WellProps extends HTMLAttributes<HTMLPreElement> {
  children: ReactNode;
  /** How tall it may grow before it scrolls. */
  size?: "sm" | "md" | "full";
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean;
  className?: string;
}

const HEIGHT = { sm: "max-h-32", md: "max-h-64", full: "" };

/** Code or logs, as written. */
export function Well({
  children,
  size = "md",
  wrap = true,
  className,
  ...props
}: WellProps) {
  return (
    <pre
      // Scrollable content must be reachable from the keyboard.
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region
      tabIndex={0}
      className={cn(
        "m-0 overflow-auto border-2 border-line bg-surface-well p-2 font-mono text-caption text-fg-muted outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        HEIGHT[size],
        wrap ? "whitespace-pre-wrap wrap-break-word" : "whitespace-pre",
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  );
}
