import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils";
import { Spinner } from "./Spinner";

// The neobrutal block: a 2px frame and a hard shadow it sinks into,
// halfway on hover and all the way when pressed.
const RAISED =
  "border-2 shadow-md transition-all duration-100 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-sm active:translate-x-1 active:translate-y-1 active:shadow-none disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-md";

export const buttonVariants = cva(
  "font-head rounded-(--radius) outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer font-medium flex justify-center items-center gap-2 whitespace-nowrap [&_svg[data-icon]]:size-4 [&_svg[data-icon]]:shrink-0 disabled:opacity-60 disabled:cursor-not-allowed touch:min-h-11",
  {
    variants: {
      variant: {
        // The one main action of a surface.
        primary: `${RAISED} bg-primary text-primary-foreground border-primary hover:bg-primary-hover [--shadow-color:var(--success-line)]`,
        // Any other action that deserves a block of its own.
        neutral: `${RAISED} bg-surface-2 text-fg border-edge hover:bg-surface-hover [--shadow-color:var(--edge-shadow)]`,
        destructive: `${RAISED} bg-danger text-primary-foreground border-danger [--shadow-color:var(--danger-line)]`,
        // Framed, no shadow: actions inside a row, a card or a notice.
        quiet:
          "border-2 border-edge bg-surface-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg",
        ghost:
          "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "bg-transparent hover:underline text-primary",
      },
      size: {
        // The action inside a row or a card header.
        row: "px-2 py-0.5 text-caption",
        sm: "px-3 py-1 text-sm",
        md: "px-4 py-1.5 text-base",
        lg: "px-6 lg:px-8 py-2 lg:py-3 text-md lg:text-lg",
        xl: "px-8 lg:px-10 py-3 lg:py-4 text-lg lg:text-xl",
        "2xl": "px-8 py-2 text-2xl lg:text-2xl",
        icon: "p-2",
      },
    },
    compoundVariants: [
      // A small block throws a small shadow.
      {
        variant: ["primary", "neutral", "destructive"],
        size: ["row", "sm"],
        className:
          "shadow-sm hover:translate-x-px hover:translate-y-px hover:shadow-xs active:translate-x-0.5 active:translate-y-0.5 disabled:shadow-sm",
      },
    ],
    defaultVariants: {
      size: "md",
      variant: "neutral",
    },
  },
);

export interface IButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Put the button's look on the single child element (a link). */
  asChild?: boolean;
  /** Shows the spinner and refuses clicks until the work ends. */
  loading?: boolean;
  /** An icon before the text. On touch the button shows the icon alone,
   *  and its text stays as its name. */
  icon?: ReactNode;
}

function Styled({
  element,
  ...props
}: HTMLAttributes<HTMLElement> & {
  element: ReactElement<Record<string, unknown>>;
}) {
  return useRender({ render: element, props });
}

export const Button = forwardRef<HTMLButtonElement, IButtonProps>(
  (
    {
      children,
      size = "md",
      className = "",
      variant = "neutral",
      asChild = false,
      loading = false,
      icon,
      disabled,
      ...props
    },
    forwardedRef,
  ) => {
    const classes = cn(
      buttonVariants({ variant, size }),
      icon &&
        "gap-1.5 touch:min-w-11 touch:px-0 [&_svg]:size-3.5 touch:[&_svg]:size-4",
      className,
    );
    // A link that looks like a button stays a link: no button role.
    if (asChild && isValidElement(children))
      return (
        <Styled
          element={children as ReactElement<Record<string, unknown>>}
          className={classes}
          {...(props as HTMLAttributes<HTMLElement>)}
        />
      );
    return (
      <ButtonPrimitive
        ref={forwardedRef}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner />}
        {icon ? (
          <>
            <span aria-hidden className="inline-flex shrink-0">
              {icon}
            </span>
            <span className="touch:sr-only">{children}</span>
          </>
        ) : (
          children
        )}
      </ButtonPrimitive>
    );
  },
);

Button.displayName = "Button";
