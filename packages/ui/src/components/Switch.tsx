"use client";

// Adapted from RetroUI's Switch (MIT, github.com/Logging-Studio/RetroUI),
// which is built on Base UI.
import { Switch as BaseSwitch } from "@base-ui/react/switch";

import { cn } from "../utils";

const Switch = ({ className, ...props }: BaseSwitch.Root.Props) => (
  <BaseSwitch.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-(--radius) border-2 border-border bg-muted transition-colors",
      "outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      "data-checked:bg-primary",
      className,
    )}
    {...props}
  >
    <BaseSwitch.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-(--radius) bg-background shadow-sm ring-0 transition-transform",
        "translate-x-0.5 data-checked:translate-x-5",
      )}
    />
  </BaseSwitch.Root>
);

export { Switch };
