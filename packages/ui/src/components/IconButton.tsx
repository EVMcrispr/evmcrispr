import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../utils";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  className?: string;
  variant?: "primary" | "outline" | "link";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { children, size = "md", className = "", variant = "primary", ...props },
    ref,
  ) => {
    const sizeClasses = {
      sm: "p-1.5",
      md: "p-2.5",
      lg: "p-3",
    };

    const variantClasses = {
      primary:
        "bg-primary text-primary-foreground border-2 border-border hover:bg-primary-hover shadow-md hover:shadow active:shadow-none hover:translate-y-0.5 active:translate-y-1 transition-all",
      outline:
        "bg-transparent text-foreground border-2 border-border shadow-md hover:shadow active:shadow-none hover:translate-y-0.5 active:translate-y-1 transition-all",
      link: "bg-transparent text-primary hover:underline",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed font-head",
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
