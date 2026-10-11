"use client";

// Adapted from the neobrutalism.dev Tabs (MIT), which is built on
// Base UI: the active tab is a filled block. The list has no frame of
// its own.
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

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

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-fg font-head data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
  {
    variants: {
      variant: {
        default: "gap-1",
        line: "gap-1 border-b-2 border-edge bg-transparent data-[orientation=vertical]:border-r-2 data-[orientation=vertical]:border-b-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const TabsList = ({
  className,
  variant = "default",
  ...props
}: BaseTabs.List.Props & VariantProps<typeof tabsListVariants>) => (
  <BaseTabs.List
    data-variant={variant}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
);

const TabsTrigger = ({ className, ...props }: BaseTabs.Tab.Props) => (
  <BaseTabs.Tab
    className={cn(
      "relative inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-(--radius) border-2 border-transparent px-3 py-1 text-sm font-head font-medium text-fg-muted outline-hidden transition-all hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background touch:min-h-11",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "data-active:border-primary data-active:bg-primary data-active:text-primary-foreground",
      "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0",
      // The `line` list marks the active tab with a bar, not a fill.
      "after:pointer-events-none after:absolute after:hidden after:bg-primary after:opacity-0 after:transition-opacity group-data-[variant=line]/tabs-list:after:block data-[orientation=horizontal]:after:inset-x-0 data-[orientation=horizontal]:after:-bottom-1 data-[orientation=horizontal]:after:h-1",
      "group-data-[variant=line]/tabs-list:data-active:border-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-fg group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
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

export { TabsComponent as Tabs, tabsListVariants };
