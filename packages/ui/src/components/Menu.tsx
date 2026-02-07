"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "../utils";

const Menu = DropdownMenu.Root;
const Trigger = DropdownMenu.Trigger;

interface IMenuContent
  extends ComponentPropsWithoutRef<typeof DropdownMenu.Content> {}

const Content = ({ className, ...props }: IMenuContent) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      className={cn(
        "z-50 min-w-[8rem] border-2 border-border bg-background p-0 text-foreground shadow-md rounded-none font-head",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </DropdownMenu.Portal>
);

const MenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenu.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center px-4 py-2 text-sm outline-none transition-colors",
      "hover:bg-primary hover:text-primary-foreground",
      "focus:bg-primary focus:text-primary-foreground",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  />
));
MenuItem.displayName = "MenuItem";

const MenuComponent = Object.assign(Menu, {
  Trigger,
  Content,
  Item: MenuItem,
});

export { MenuComponent as Menu };
