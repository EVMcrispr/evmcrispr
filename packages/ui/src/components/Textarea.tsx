import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "../utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
  /** `quiet`: for working areas. */
  variant?: "default" | "quiet";
}

const DEFAULT =
  "w-full rounded-(--radius) border-2 border-border bg-background px-3 py-2 text-foreground font-head resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const QUIET =
  "w-full resize-none rounded-(--radius) border-2 border-edge bg-surface-1 px-2.5 py-2 font-sans text-body text-fg placeholder:text-fg-faint outline-hidden transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 touch:text-title";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      placeholder = "Enter text",
      className = "",
      variant = "default",
      ...props
    },
    ref,
  ) => {
    return (
      <textarea
        ref={ref}
        placeholder={placeholder}
        className={cn(variant === "quiet" ? QUIET : DEFAULT, className)}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
