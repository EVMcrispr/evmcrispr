import { Button, cn, Dot, type Tone } from "@repo/ui";
import { Code, ListTree, ShieldCheck } from "@repo/ui/icons";
import { useScript } from "../app/SpaceContext";
import type { Simulation } from "../review/useReview";

function chip(state: Simulation): {
  label: string;
  tone: Tone;
  pulse: boolean;
} {
  switch (state.status) {
    case "validating":
    case "simulating":
      return { label: "Checking…", tone: "neutral", pulse: true };
    case "valid":
    case "ready":
      return { label: "Ready", tone: "success", pulse: false };
    case "error":
      return { label: "Error", tone: "danger", pulse: false };
    default:
      return { label: "Review", tone: "neutral", pulse: false };
  }
}

// Written out in full: Tailwind finds class names by reading the source.
const TONE: Partial<Record<Tone, string>> = {
  neutral: "text-fg-muted",
  success: "text-success",
  danger: "text-danger",
};

export function ScriptContextBar({
  reviewState,
  reviewUnseen,
  onOpenScript,
  onOpenTimeline,
  onOpenReview,
}: {
  reviewState: Simulation;
  reviewUnseen: boolean;
  onOpenScript: () => void;
  onOpenTimeline: () => void;
  onOpenReview: () => void;
}) {
  const { title } = useScript();
  const review = chip(reviewState);

  return (
    <nav
      aria-label="Script workspace"
      className="mx-3 mt-2 mb-1 flex shrink-0 items-center gap-1.5 rounded-(--radius) border-2 border-edge bg-surface-1 p-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Open script"
        className="min-w-0 flex-1 justify-start gap-2 px-2 text-fg"
        onClick={onOpenScript}
      >
        <Code aria-hidden data-icon="inline-start" className="text-fg-faint" />
        <span className={cn("truncate", !title && "text-fg-faint")}>
          {title || "Untitled script"}
        </span>
      </Button>

      <Button
        type="button"
        variant="quiet"
        size="sm"
        aria-label="Open timeline"
        className="gap-1.5 px-2"
        onClick={onOpenTimeline}
      >
        <ListTree aria-hidden className="size-4" />
        <span className="hidden min-[400px]:inline">Timeline</span>
      </Button>

      <Button
        type="button"
        variant="quiet"
        size="sm"
        aria-label="Open transaction review"
        className={cn("relative gap-1.5 px-2", TONE[review.tone])}
        onClick={onOpenReview}
      >
        <ShieldCheck
          aria-hidden
          className={cn("size-4", review.pulse && "animate-pulse")}
        />
        <span className="hidden min-[360px]:inline">{review.label}</span>
        {reviewUnseen && (
          <Dot tone="success" className="absolute -top-1 -right-1" />
        )}
      </Button>
    </nav>
  );
}
