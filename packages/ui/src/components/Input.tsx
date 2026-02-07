import { type InputHTMLAttributes, forwardRef } from "react";

import { cn } from "../utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { type = "text", placeholder = "Enter text", className = "", ...props },
    ref,
  ) => {
    return (
      <input
        ref={ref}
        type={type}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-none border-2 border-border bg-background px-3 py-2 text-foreground font-head",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
