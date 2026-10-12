"use client";

// Adapted from RetroUI's Popover (MIT, github.com/Logging-Studio/RetroUI),
// which is built on Base UI.
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ComponentProps } from "react";

import { cn } from "../utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  anchor,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "anchor"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          className={cn(
            "w-72 origin-(--transform-origin) border-2 border-edge bg-surface-sheet p-4 text-fg rounded-(--radius) shadow-md outline-hidden font-sans [--shadow-color:var(--edge-shadow)]",
            "transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-1 text-sm", className)} {...props} />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      className={cn("text-base font-head font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

const PopoverObject = Object.assign(Popover, {
  Trigger: PopoverTrigger,
  Content: PopoverContent,
  Header: PopoverHeader,
  Title: PopoverTitle,
  Description: PopoverDescription,
});

export { PopoverObject as Popover };
