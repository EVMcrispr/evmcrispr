"use client";

// Adapted from RetroUI's Tooltip (MIT, github.com/Logging-Studio/RetroUI),
// which is built on Base UI.
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../utils";

const tooltipContentVariants = cva(
  "origin-(--transform-origin) overflow-hidden border-2 border-border bg-background px-3 py-1.5 text-xs rounded-(--radius) font-head transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        // What a control without words does, said on hover.
        plain: "border-edge bg-surface-sheet font-sans text-caption text-fg",
        warning: "bg-evm-orange-800 text-white border-evm-orange-400",
        solid: "bg-foreground text-background",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const TooltipProvider = BaseTooltip.Provider;
const Tooltip = BaseTooltip.Root;
const TooltipTrigger = BaseTooltip.Trigger;

const TooltipContent = ({
  className,
  variant,
  align = "center",
  alignOffset = 0,
  side = "top",
  sideOffset = 4,
  ...props
}: BaseTooltip.Popup.Props &
  Pick<
    BaseTooltip.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > &
  VariantProps<typeof tooltipContentVariants>) => (
  <BaseTooltip.Portal>
    <BaseTooltip.Positioner
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className="isolate z-50"
    >
      <BaseTooltip.Popup
        className={cn(tooltipContentVariants({ variant }), className)}
        {...props}
      />
    </BaseTooltip.Positioner>
  </BaseTooltip.Portal>
);

const TooltipObject = Object.assign(Tooltip, {
  Trigger: TooltipTrigger,
  Content: TooltipContent,
  Provider: TooltipProvider,
});

export { TooltipObject as Tooltip };
