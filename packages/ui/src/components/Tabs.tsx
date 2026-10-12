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

const TabsList = ({ className, children, ...props }: BaseTabs.List.Props) => (
  <BaseTabs.List
    className={cn(
      "relative inline-flex w-fit items-center justify-center gap-1 border-b-2 border-edge font-head text-fg data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:border-r-2 data-[orientation=vertical]:border-b-0",
      className,
    )}
    {...props}
  >
    {children}
    {/* The bar under the active tab, drawn over the list's line. It is
        one bar, so it travels from a tab to the next. */}
    <BaseTabs.Indicator
      className={cn(
        "pointer-events-none absolute bg-primary transition-[translate,width,height] duration-300 ease-out",
        "data-[orientation=horizontal]:-bottom-0.5 data-[orientation=horizontal]:left-0 data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-(--active-tab-width) data-[orientation=horizontal]:translate-x-(--active-tab-left)",
        "data-[orientation=vertical]:top-0 data-[orientation=vertical]:-right-0.5 data-[orientation=vertical]:h-(--active-tab-height) data-[orientation=vertical]:w-1 data-[orientation=vertical]:translate-y-(--active-tab-top)",
      )}
    />
  </BaseTabs.List>
);

const TabsTrigger = ({ className, ...props }: BaseTabs.Tab.Props) => (
  <BaseTabs.Tab
    className={cn(
      "relative inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-(--radius) px-3 py-1.5 text-sm font-head font-medium text-fg-muted outline-hidden transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring touch:min-h-11",
      "data-disabled:pointer-events-none data-disabled:opacity-50 data-active:text-fg",
      "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0",
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
