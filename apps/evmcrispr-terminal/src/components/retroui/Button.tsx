import { type VariantProps, cva } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "font-head transition-all rounded-none outline-hidden cursor-pointer duration-200 font-medium flex justify-center items-center disabled:opacity-60 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default:
          "shadow-md hover:shadow active:shadow-none bg-primary text-primary-foreground border-2 border-border transition hover:translate-y-1 active:translate-y-2 active:translate-x-1 hover:bg-primary-hover",
        secondary:
          "shadow-md hover:shadow active:shadow-none bg-secondary text-secondary-foreground border-2 border-border-secondary transition hover:translate-y-1 active:translate-y-2 active:translate-x-1",
        outline:
          "shadow-md hover:shadow active:shadow-none bg-transparent text-foreground border-2 border-border transition hover:translate-y-1 active:translate-y-2 active:translate-x-1",
        link: "bg-transparent hover:underline text-primary",
        ghost: "bg-transparent hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        sm: "px-3 py-1 text-sm shadow hover:shadow-none",
        md: "px-4 py-1.5 text-base",
        lg: "px-6 lg:px-8 py-2 lg:py-3 text-md lg:text-lg",
        xl: "px-8 lg:px-10 py-3 lg:py-4 text-lg lg:text-xl",
        "2xl": "px-8 py-2 text-2xl lg:text-2xl",
        icon: "p-2",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  },
);

export interface IButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, IButtonProps>(
  (
    {
      children,
      size = "md",
      className = "",
      variant = "default",
      asChild = false,
      ...props
    },
    forwardedRef,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={forwardedRef}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);

Button.displayName = "Button";
