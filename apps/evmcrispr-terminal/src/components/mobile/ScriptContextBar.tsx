import { CodeBracketIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button, cn } from "@repo/ui";
import type { TransactionReviewState } from "../../hooks/useTransactionReview";

function chip(state: TransactionReviewState): {
  label: string;
  className: string;
  pulse: boolean;
} {
  switch (state.status) {
    case "validating":
    case "simulating":
      return {
        label: "Checking…",
        className: "border-foreground/15 text-foreground/65",
        pulse: true,
      };
    case "valid":
    case "ready":
      return {
        label: "Ready",
        className: "border-primary/40 text-primary",
        pulse: false,
      };
    case "error":
      return {
        label: "Error",
        className: "border-destructive/50 text-destructive",
        pulse: false,
      };
    default:
      return {
        label: "Review",
        className: "border-foreground/15 text-foreground/65",
        pulse: false,
      };
  }
}

export function ScriptContextBar({
  title,
  reviewState,
  reviewUnseen,
  onOpenScript,
  onOpenReview,
}: {
  title: string;
  reviewState: TransactionReviewState;
  reviewUnseen: boolean;
  onOpenScript: () => void;
  onOpenReview: () => void;
}) {
  const review = chip(reviewState);

  return (
    <nav
      aria-label="Script workspace"
      className="mx-3 mb-1 mt-2 flex min-h-12 shrink-0 items-center gap-1 border border-foreground/15 bg-foreground/4 px-1.5 backdrop-blur"
    >
      <Button
        type="button"
        variant="ghost"
        aria-label="Open script"
        className="min-h-11 min-w-0 flex-1 justify-start gap-2 px-2 font-sans text-sm text-foreground shadow-none"
        onClick={onOpenScript}
      >
        <CodeBracketIcon
          data-icon="inline-start"
          className="shrink-0 text-foreground/65"
        />
        <span className={cn("truncate", !title && "text-foreground/50")}>
          {title || "Untitled script"}
        </span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        aria-label="Open transaction review"
        className={cn(
          "relative min-h-8 gap-1.5 border px-2 py-1 font-sans text-xs shadow-none",
          review.className,
        )}
        onClick={onOpenReview}
      >
        <ShieldCheckIcon
          className={cn("size-4", review.pulse && "animate-pulse")}
        />
        <span className="hidden min-[360px]:inline">{review.label}</span>
        {reviewUnseen && (
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />
        )}
      </Button>
    </nav>
  );
}
