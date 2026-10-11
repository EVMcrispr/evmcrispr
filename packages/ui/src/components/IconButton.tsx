import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

import { cn } from "../utils";
import { Tooltip } from "./Tooltip";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** What hovering it says. Left out, it is the button's name (its
   *  `title`, else its `aria-label`): a button without words always
   *  says what it does. `false` for a button that has its own. */
  tooltip?: ReactNode | false;
  variant?: "primary" | "neutral" | "link" | "ghost" | "quiet" | "destructive";
}

const RAISED =
  "border-2 shadow-sm transition-all duration-100 hover:translate-x-px hover:translate-y-px hover:shadow-xs active:translate-x-0.5 active:translate-y-0.5 active:shadow-none";

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children,
      size = "md",
      className = "",
      variant = "primary",
      tooltip,
      title,
      ...props
    },
    ref,
  ) => {
    // An icon says nothing to a screen reader.
    if (
      process.env.NODE_ENV !== "production" &&
      !props["aria-label"] &&
      !props["aria-labelledby"] &&
      !title
    )
      console.error(
        "IconButton needs an accessible name: pass aria-label or title.",
      );

    const sizeClasses = {
      sm: "p-1.5",
      md: "p-2.5",
      lg: "p-3",
    };

    const variantClasses = {
      primary: `${RAISED} bg-primary text-primary-foreground border-primary hover:bg-primary-hover [--shadow-color:var(--success-line)] [&_svg]:size-4`,
      link: "bg-transparent text-primary hover:underline",
      ghost:
        "bg-transparent text-foreground/60 hover:text-foreground transition-colors",
      neutral: `${RAISED} bg-surface-2 text-fg border-edge hover:bg-surface-hover [--shadow-color:var(--edge-shadow)] touch:min-h-11 touch:min-w-11 [&_svg]:size-4`,
      // Framed, no shadow: inside a row, a card or a header.
      quiet:
        "border-2 border-transparent bg-transparent text-fg-faint hover:border-edge hover:bg-surface-hover hover:text-fg transition-colors touch:min-h-11 touch:min-w-11 [&_svg]:size-4",
      destructive:
        "border-2 border-transparent bg-transparent text-fg-faint hover:text-danger transition-colors touch:min-h-11 touch:min-w-11 [&_svg]:size-4",
    };

    const classes = cn(
      "inline-flex items-center justify-center rounded-(--radius) cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 disabled:cursor-not-allowed font-head touch:min-h-11 touch:min-w-11",
      sizeClasses[size],
      variantClasses[variant],
      className,
    );
    const said =
      tooltip === false ? null : (tooltip ?? title ?? props["aria-label"]);
    // Its own tooltip replaces the browser's: the name stays for screen
    // readers, as `aria-label`.
    const named = props["aria-label"] ?? title;

    if (!said || props.disabled)
      return (
        <ButtonPrimitive ref={ref} className={classes} title={title} {...props}>
          {children}
        </ButtonPrimitive>
      );
    return (
      <Tooltip>
        <Tooltip.Trigger
          ref={ref}
          render={<ButtonPrimitive />}
          className={classes}
          {...props}
          aria-label={named}
        >
          {children}
        </Tooltip.Trigger>
        <Tooltip.Content variant="plain">{said}</Tooltip.Content>
      </Tooltip>
    );
  },
);

IconButton.displayName = "IconButton";
