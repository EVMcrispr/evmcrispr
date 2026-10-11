import { cn } from "../utils";

interface SpinnerProps {
  size?: "sm" | "md";
  /** What is being waited for; read by screen readers. */
  label?: string;
  className?: string;
}

/** The one spinner. It takes the colour of the text around it. */
export function Spinner({
  size = "sm",
  label = "Loading",
  className,
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full will-change-transform border-2 border-current border-t-transparent",
        size === "sm" ? "size-3.5" : "size-5",
        className,
      )}
    />
  );
}
