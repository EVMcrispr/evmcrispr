import { Input as InputPrimitive } from "@base-ui/react/input";
import { Search } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "../utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  /** `quiet`: for working areas. `search`: quiet, with its icon. */
  variant?: "default" | "quiet" | "search";
}

const DEFAULT =
  "w-full rounded-(--radius) border-2 border-border bg-background px-3 py-2 text-foreground font-head placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const QUIET =
  "w-full rounded-(--radius) border-2 border-edge bg-surface-1 px-2.5 py-1.5 font-sans text-body text-fg placeholder:text-fg-faint outline-hidden transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring read-only:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60 touch:min-h-11 touch:text-title";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type,
      placeholder = "Enter text",
      className = "",
      variant = "default",
      ...props
    },
    ref,
  ) => {
    if (variant === "search")
      return (
        <div className="relative w-full">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-faint"
          />
          <InputPrimitive
            ref={ref}
            type={type ?? "search"}
            placeholder={placeholder}
            className={cn(QUIET, "pl-8", className)}
            {...props}
          />
        </div>
      );
    return (
      <InputPrimitive
        ref={ref}
        type={type ?? "text"}
        placeholder={placeholder}
        className={cn(variant === "quiet" ? QUIET : DEFAULT, className)}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
