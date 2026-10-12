import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../utils";

interface RowProps {
  title: ReactNode;
  /** The second line: time, marks, counts. */
  meta?: ReactNode;
  /** Before the title: an icon. */
  leading?: ReactNode;
  /** After the row, outside its own button: buttons that act on it. */
  actions?: ReactNode;
  /** Shown under the row: while `open` is true on an expandable row,
   *  always on one that does not expand. */
  children?: ReactNode;
  /** Defined makes the row expandable; the value says whether it is. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
  /** `title`: the title in the heading colour (a space's name). */
  emphasis?: "default" | "title";
  /** Let the title wrap instead of truncating (a sentence, not a name). */
  wrap?: boolean;
  as?: "div" | "li";
  /** Names the row for a view transition: what carries the same name
   *  after the change is what the row becomes. */
  transitionName?: string;
  /** Names the title alone for a view transition: it travels by itself
   *  to the title that carries the same name afterwards. */
  titleTransitionName?: string;
  /** A class of view transition the row takes part in, for the rows
   *  that move the same way. Needs a `transitionName` of its own. */
  transitionClass?: string;
  className?: string;
}

const MAIN =
  "group/main flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left font-sans text-body touch:py-3";
const INTERACTIVE =
  "cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 data-disabled:cursor-not-allowed data-disabled:opacity-60";

/** A line in a list: a framed block without a shadow. Its own click
 *  target and the buttons that act on it are siblings, so neither is
 *  nested in the other. */
export function Row({
  title,
  meta,
  leading,
  actions,
  children,
  open,
  onOpenChange,
  active = false,
  disabled = false,
  onClick,
  href,
  emphasis = "default",
  wrap = false,
  as: Comp = "div",
  transitionName,
  transitionClass,
  titleTransitionName,
  className,
}: RowProps) {
  const style = transitionName
    ? ({
        viewTransitionName: transitionName,
        viewTransitionClass: transitionClass,
      } as CSSProperties)
    : undefined;
  const expandable = open !== undefined;
  const interactive = expandable || !!(onClick || href);

  const content = (
    <>
      {expandable && (
        <ChevronRight
          aria-hidden
          className="mt-1 size-3 shrink-0 text-fg-faint transition-transform group-data-panel-open/main:rotate-90"
        />
      )}
      {leading && (
        <span className="mt-0.5 shrink-0 text-fg-faint">{leading}</span>
      )}
      <span className="min-w-0 flex-1">
        <span
          style={
            titleTransitionName
              ? { viewTransitionName: titleTransitionName }
              : undefined
          }
          className={cn(
            "block",
            wrap ? "wrap-break-word" : "truncate",
            emphasis === "title" ? "font-bold text-heading" : "text-fg-muted",
          )}
        >
          {title}
        </span>
        {meta && (
          <span
            className={cn(
              "mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption",
              // On the active row's lighter surface the faint grey is
              // too dim to read.
              active ? "text-fg-muted" : "text-fg-faint",
            )}
          >
            {meta}
          </span>
        )}
      </span>
    </>
  );

  const frame = cn(
    "border-2 bg-surface-1 transition-colors",
    active
      ? "border-primary bg-surface-active shadow-sm [--shadow-color:var(--success-line)]"
      : "border-edge",
    interactive && !active && "hover:bg-surface-hover",
    className,
  );

  const trailing = actions && (
    <div className="flex shrink-0 items-center gap-1 pr-1.5">{actions}</div>
  );

  if (expandable)
    return (
      <Collapsible.Root
        open={open}
        onOpenChange={(next) => onOpenChange?.(next)}
        disabled={disabled}
        render={<Comp />}
        style={style}
        className={frame}
      >
        <div className="flex items-stretch">
          <Collapsible.Trigger className={cn(MAIN, INTERACTIVE)}>
            {content}
          </Collapsible.Trigger>
          {trailing}
        </div>
        <Collapsible.Panel className="flex flex-wrap gap-2 px-7.5 pb-2.5">
          {children}
        </Collapsible.Panel>
      </Collapsible.Root>
    );

  return (
    <Comp style={style} className={frame}>
      <div className="flex items-stretch">
        {href ? (
          <a
            href={href}
            // Another site opens beside the app, not over it.
            {...(/^https?:/.test(href)
              ? { target: "_blank", rel: "noreferrer" }
              : {})}
            aria-current={active ? "true" : undefined}
            className={cn(MAIN, INTERACTIVE)}
          >
            {content}
          </a>
        ) : onClick ? (
          <button
            type="button"
            aria-current={active ? "true" : undefined}
            disabled={disabled}
            className={cn(MAIN, INTERACTIVE)}
            onClick={onClick}
          >
            {content}
          </button>
        ) : (
          <div className={MAIN}>{content}</div>
        )}
        {trailing}
      </div>
      {children && (
        <div className="flex flex-wrap gap-2 px-2.5 pb-2.5">{children}</div>
      )}
    </Comp>
  );
}
