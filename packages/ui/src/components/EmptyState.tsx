import type { ReactNode } from "react";
import { cn } from "../utils";

interface EmptyStateProps {
  /** One sentence saying what is not here. */
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 border-2 border-dashed border-line px-3 py-6 text-center",
        className,
      )}
    >
      <p className="m-0 font-sans text-body text-fg-faint">{children}</p>
      {action}
    </div>
  );
}
