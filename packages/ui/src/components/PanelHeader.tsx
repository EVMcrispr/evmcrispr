import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../utils";

interface BackButtonProps {
  /** Where it goes: "Spaces", "Agents", "Chat". */
  label: string;
  onClick: () => void;
  className?: string;
}

/** "‹ Spaces". It always says where it goes; on touch the arrow stands
 *  alone and the destination stays as its name. */
export function BackButton({ label, onClick, className }: BackButtonProps) {
  return (
    <button
      type="button"
      aria-label={`Back to ${label}`}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-(--radius) border-2 border-edge bg-surface-1 py-0.5 pr-2 pl-1 font-sans text-caption font-medium text-fg-muted outline-hidden transition-colors hover:bg-surface-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-ring touch:min-h-11 touch:min-w-11 touch:justify-center touch:px-0",
        className,
      )}
      onClick={onClick}
    >
      <ChevronLeft aria-hidden className="size-4 touch:size-5" />
      <span className="touch:sr-only">{label}</span>
    </button>
  );
}

interface PanelHeaderProps {
  title: ReactNode;
  /** A `BackButton`. */
  back?: ReactNode;
  /** After the title: icon buttons, a count. */
  actions?: ReactNode;
  /** `title`: in the heading colour, for the name of a space. */
  emphasis?: "default" | "title";
  /** Names the title alone for a view transition: it travels by itself
   *  to the title that carries the same name afterwards. */
  titleTransitionName?: string;
  className?: string;
}

/** The top of a panel, a sheet or a detail view. */
export function PanelHeader({
  title,
  back,
  actions,
  emphasis = "default",
  titleTransitionName,
  className,
}: PanelHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-11 items-center gap-2.5 border-b-2 border-edge px-2.5 py-1.5 touch:px-3",
        className,
      )}
    >
      {back}
      <h2
        style={
          titleTransitionName
            ? { viewTransitionName: titleTransitionName }
            : undefined
        }
        className={cn(
          "m-0 min-w-0 flex-1 truncate font-head text-title font-bold",
          emphasis === "title" ? "text-heading" : "text-fg",
        )}
      >
        {title}
      </h2>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </header>
  );
}
