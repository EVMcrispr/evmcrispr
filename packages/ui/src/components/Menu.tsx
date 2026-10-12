"use client";

// Adapted from RetroUI's Menu (MIT, github.com/Logging-Studio/RetroUI),
// which is built on Base UI.
import { Menu as BaseMenu } from "@base-ui/react/menu";

import { cn } from "../utils";

const Menu = BaseMenu.Root;
const Trigger = BaseMenu.Trigger;

function Content({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: BaseMenu.Popup.Props &
  Pick<
    BaseMenu.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        className="isolate z-50 outline-hidden"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <BaseMenu.Popup
          className={cn(
            "min-w-32 origin-(--transform-origin) overflow-hidden border-2 border-edge bg-surface-sheet p-0 text-fg shadow-md rounded-(--radius) font-sans outline-hidden [--shadow-color:var(--edge-shadow)]",
            // Base UI's own open and close states: it waits for these
            // transitions before it takes the popup away.
            "transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none",
            className,
          )}
          {...props}
        />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

function MenuItem({ className, ...props }: BaseMenu.Item.Props) {
  return (
    <BaseMenu.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-body outline-hidden transition-colors touch:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0",
        "hover:bg-primary hover:text-primary-foreground",
        "data-highlighted:bg-primary data-highlighted:text-primary-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

const MenuComponent = Object.assign(Menu, {
  Trigger,
  Content,
  Item: MenuItem,
});

export { MenuComponent as Menu };
