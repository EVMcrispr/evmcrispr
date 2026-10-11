import type { ReactNode } from "react";
import { TONE_EDGE, TONE_FILL, TONE_TEXT, type Tone } from "../tone";
import { cn } from "../utils";

interface NoticeProps {
  tone?: Tone;
  /** `strip`: full width at the top of a surface. `block`: inside
   *  content. `inline`: one line of text, under a field or a button. */
  layout?: "strip" | "block" | "inline";
  title?: ReactNode;
  /** A button or a link that answers the notice. */
  action?: ReactNode;
  /** Interrupt a screen reader whatever the tone: something the user
   *  just asked for was refused. */
  urgent?: boolean;
  /** The notice reports something going on, and is read out when it
   *  appears or changes. One that only explains is not. */
  live?: boolean;
  children: ReactNode;
  className?: string;
}

/** Something the reader should know. Danger interrupts a screen reader,
 *  a live one is read out when the reader is idle, and the rest are
 *  notes: there to be read, announced by nothing. */
export function Notice({
  tone = "info",
  layout = "block",
  title,
  action,
  urgent = false,
  live = false,
  children,
  className,
}: NoticeProps) {
  const role = urgent || tone === "danger" ? "alert" : live ? "status" : "note";
  if (layout === "inline")
    return (
      <p
        role={role}
        className={cn("m-0 font-sans text-caption", TONE_TEXT[tone], className)}
      >
        {children}
      </p>
    );
  return (
    <div
      role={role}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 font-sans text-body",
        TONE_FILL[tone],
        TONE_EDGE[tone],
        layout === "strip" ? "border-b-2" : "border-2 shadow",
        className,
      )}
    >
      <div className="min-w-40 flex-1">
        {title && (
          <p className={cn("m-0 font-head font-bold", TONE_TEXT[tone])}>
            {title}
          </p>
        )}
        <div className="text-fg-muted">{children}</div>
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}
