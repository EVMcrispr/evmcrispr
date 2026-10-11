"use client";

// Built on Base UI, after the neobrutalism.dev Tabs (MIT): tabs stand on
// a line, and a thick bar marks the active one.
import { Tabs as BaseTabs } from "@base-ui/react/tabs";

import { cn } from "../utils";

const Tabs = ({ className, ...props }: BaseTabs.Root.Props) => (
  <BaseTabs.Root
    className={cn(
      "flex flex-col gap-2 data-[orientation=vertical]:flex-row data-[orientation=vertical]:items-start",
      className,
    )}
    {...props}
  />
);

const TabsList = ({ className, ...props }: BaseTabs.List.Props) => (
  <BaseTabs.List
    className={cn(
      "inline-flex w-fit items-center justify-center gap-1 border-b-2 border-edge font-head text-fg data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:border-r-2 data-[orientation=vertical]:border-b-0",
      className,
    )}
    {...props}
  />
);

const TabsTrigger = ({ className, ...props }: BaseTabs.Tab.Props) => (
  <BaseTabs.Tab
    className={cn(
      "relative inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-(--radius) px-3 py-1.5 text-sm font-head font-medium text-fg-muted outline-hidden transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring touch:min-h-11",
      "data-disabled:pointer-events-none data-disabled:opacity-50 data-active:text-fg",
      "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0",
      // The bar under the active tab, drawn over the list's line.
      "after:pointer-events-none after:absolute after:bg-primary after:opacity-0 after:transition-opacity data-active:after:opacity-100 data-[orientation=horizontal]:after:inset-x-0 data-[orientation=horizontal]:after:-bottom-0.5 data-[orientation=horizontal]:after:h-1 data-[orientation=vertical]:after:inset-y-0 data-[orientation=vertical]:after:-right-0.5 data-[orientation=vertical]:after:w-1",
      className,
    )}
    {...props}
  />
);

const TabsContent = ({ className, ...props }: BaseTabs.Panel.Props) => (
  <BaseTabs.Panel
    className={cn(
      "flex-1 outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
    {...props}
  />
);

const TabsComponent = Object.assign(Tabs, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});

export { TabsComponent as Tabs };
