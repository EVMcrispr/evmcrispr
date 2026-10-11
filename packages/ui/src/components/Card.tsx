import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import { TONE_EDGE, type Tone } from "../tone";
import { cn } from "../utils";

/** Whether the card around a header or a body collapses. */
const CollapsibleCard = createContext(false);

interface CardProps {
  /** Sets the card's frame and shadow. Neutral unless the card as a
   *  whole is in a state the reader must notice (paused, failed,
   *  unverified). */
  tone?: Tone;
  /** Defined makes the card collapsible; the value says whether its
   *  body is shown. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
  "aria-label"?: string;
  /** `article`: a piece that stands on its own in a feed (a message of a
   *  chat). A card is a section otherwise. */
  as?: "section" | "article";
  children: ReactNode;
  className?: string;
}

function CardRoot({
  tone = "neutral",
  open,
  onOpenChange,
  id,
  "aria-label": label,
  as: Comp = "section",
  children,
  className,
}: CardProps) {
  const frame = cn("border-2 bg-surface-2 shadow", TONE_EDGE[tone], className);
  if (open === undefined)
    return (
      <Comp id={id} aria-label={label} className={frame}>
        {children}
      </Comp>
    );
  return (
    <CollapsibleCard.Provider value>
      <Collapsible.Root
        open={open}
        onOpenChange={(next) => onOpenChange?.(next)}
        render={<Comp id={id} aria-label={label} />}
        className={frame}
      >
        {children}
      </Collapsible.Root>
    </CollapsibleCard.Provider>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  /** After the title: a `Badge`. */
  status?: ReactNode;
  /** At the end of the title line: a `Time`. */
  time?: ReactNode;
  /** Outside the toggle: buttons that act on the card. */
  actions?: ReactNode;
}

const LINE =
  "group/head flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left font-sans text-body touch:py-3";

function CardHeader({ title, status, time, actions }: CardHeaderProps) {
  const collapsible = useContext(CollapsibleCard);
  const content = (
    <>
      {collapsible && (
        <ChevronRight
          aria-hidden
          className="size-3 shrink-0 text-fg-faint transition-transform group-data-panel-open/head:rotate-90"
        />
      )}
      <span className="truncate font-head font-bold text-fg">{title}</span>
      {status}
      {time && (
        <span className="ml-auto shrink-0 text-caption text-fg-faint">
          {time}
        </span>
      )}
    </>
  );
  return (
    <div className="flex items-center gap-2">
      {collapsible ? (
        <Collapsible.Trigger
          className={cn(
            LINE,
            "cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {content}
        </Collapsible.Trigger>
      ) : (
        <div className={LINE}>{content}</div>
      )}
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5 pr-2.5">
          {actions}
        </div>
      )}
    </div>
  );
}

const BODY =
  "flex flex-col gap-2.5 border-t-2 border-line p-2.5 font-sans text-body text-fg-muted";

function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const collapsible = useContext(CollapsibleCard);
  return collapsible ? (
    <Collapsible.Panel className={cn(BODY, className)}>
      {children}
    </Collapsible.Panel>
  ) : (
    <div className={cn(BODY, className)}>{children}</div>
  );
}

function CardFooter({
  summary,
  children,
  className,
}: {
  /** Fills the space beside the buttons: the latest line of what the
   *  body holds. On a collapsible card it opens and closes the body. */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const collapsible = useContext(CollapsibleCard);
  const line =
    "min-w-0 flex-1 truncate text-left font-mono text-caption text-fg-faint";
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 border-t-2 border-line p-2.5",
        !summary && "flex-wrap",
        className,
      )}
    >
      {summary &&
        (collapsible ? (
          <Collapsible.Trigger
            className={cn(
              line,
              "cursor-pointer outline-hidden transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring touch:min-h-11",
            )}
          >
            {summary}
          </Collapsible.Trigger>
        ) : (
          <span className={line}>{summary}</span>
        ))}
      {children}
    </div>
  );
}

/** A bounded block: a run, a tool call, a held action. */
export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
