import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "../utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ placeholder = "Enter text", className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-none border-2 border-border bg-background px-3 py-2 text-foreground font-head resize-none",
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

Textarea.displayName = "Textarea";
