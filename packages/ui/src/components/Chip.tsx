import { Toggle } from "@base-ui/react/toggle";
import type { ReactNode } from "react";
import { cn } from "../utils";

interface ChipProps {
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/** A selectable block: a filter, a mode. The selected one is marked by
 *  its frame and its text, not filled: fills are for the main action. */
export function Chip({
  selected = false,
  onSelectedChange,
  disabled,
  children,
  className,
}: ChipProps) {
  return (
    <Toggle
      pressed={selected}
      onPressedChange={(pressed) => onSelectedChange?.(pressed)}
      disabled={disabled}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-(--radius) border-2 border-edge bg-surface-1 px-2.5 py-0.5 font-sans text-caption font-medium text-fg-muted outline-hidden transition-colors hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background touch:min-h-11 touch:px-4 data-pressed:border-success data-pressed:bg-success-surface data-pressed:text-success data-disabled:cursor-not-allowed data-disabled:opacity-60",
        className,
      )}
    >
      {children}
    </Toggle>
  );
}
