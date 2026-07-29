"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "../utils";

const Tabs = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    className={cn("flex flex-col gap-2", className)}
    {...props}
  />
));
Tabs.displayName = "Tabs";

const tabsListVariants = cva(
  "inline-flex w-fit items-center justify-center rounded-none text-foreground font-head",
  {
    variants: {
      variant: {
        default: "border-b-2 border-border",
        line: "gap-1 bg-transparent border-b-2 border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-head",
      "whitespace-nowrap cursor-pointer transition-colors",
      "border-b-2 border-b-transparent -mb-[2px]",
      "text-foreground/60 hover:text-foreground",
      "data-[state=active]:text-evm-green-300 data-[state=active]:border-b-evm-green-300",
      "disabled:pointer-events-none disabled:opacity-50",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("flex-1 outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

const TabsComponent = Object.assign(Tabs, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});

export { TabsComponent as Tabs, tabsListVariants };
