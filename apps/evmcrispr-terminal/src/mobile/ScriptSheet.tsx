import type { HoverRef } from "@evmcrispr/core";
import { BackButton, Badge, Button, IconButton, Notice, toast } from "@repo/ui";
import { ClipboardCopy, Lock, Sparkles } from "@repo/ui/icons";
import { useScript } from "../app/SpaceContext";
import ShareScriptButton from "../components/scripts/ShareScriptButton";
import { ScriptView } from "../editor/ScriptView";
import type { Simulation } from "../review/useReview";

function reviewLabel(state: Simulation) {
  if (state.status === "validating") return "Validating";
  if (state.status === "simulating") return "Simulating";
  if (state.status === "ready") return "Simulation passed";
  if (state.status === "valid") return "Valid";
  return "Not reviewed";
}

export function ScriptSheet({
  entryIntent,
  sharedEncrypted = false,
  reviewState,
  onBackToChat,
  onReview,
  onOpenDocs,
}: {
  entryIntent: "author" | "recipient";
  sharedEncrypted?: boolean;
  reviewState: Simulation;
  onBackToChat: () => void;
  onReview: () => void;
  onOpenDocs?: (ref: HoverRef) => void;
}) {
  const { title, text: script } = useScript();
  const isReady =
    reviewState.status === "valid" || reviewState.status === "ready";

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Script review"
    >
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {entryIntent === "author" && (
            <BackButton label="chat" onClick={onBackToChat} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate font-head text-display font-bold text-heading">
              {title || "Untitled script"}
            </h1>
            {entryIntent === "recipient" ? (
              <p className="m-0 flex items-center gap-1.5 font-sans text-caption text-fg-faint">
                {/* Only encrypted share envelopes may claim encryption —
                    plain pins and bare JSON envelopes are public. */}
                {sharedEncrypted && <Lock aria-hidden className="size-3.5" />}
                {sharedEncrypted
                  ? "Shared with you · Encrypted link"
                  : "Shared with you"}
              </p>
            ) : (
              <p className="m-0 font-sans text-caption text-fg-faint">
                Read-only here · edit through chat
              </p>
            )}
          </div>
          <ShareScriptButton mobile />
          <IconButton
            type="button"
            aria-label="Copy script"
            variant="quiet"
            size="sm"
            tooltip={false}
            onClick={() => {
              void navigator.clipboard.writeText(script);
              toast.success("Script copied");
            }}
          >
            <ClipboardCopy aria-hidden className="size-4" />
          </IconButton>
        </div>

        <div className="flex items-center gap-2">
          {reviewState.status !== "error" && (
            <span role="status">
              <Badge variant="tag" tone={isReady ? "success" : "neutral"} dot>
                {reviewLabel(reviewState)}
              </Badge>
            </span>
          )}
          {reviewState.status === "ready" && (
            <span className="font-sans text-caption text-fg-faint">
              {reviewState.actions.length} resolved action
              {reviewState.actions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="mx-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-(--radius) border-2 border-edge bg-surface-well">
        <div className="min-h-0 flex-1">
          <ScriptView onOpenDocs={onOpenDocs} />
        </div>
      </div>

      <div className="mx-3 mt-2 shrink-0">
        <Notice tone="neutral" layout="inline">
          Nothing is sent until you review and confirm in your wallet.
        </Notice>
      </div>

      <div className="mobile-safe-bottom grid shrink-0 grid-cols-2 gap-3 px-3 pt-2 pb-3">
        <Button
          type="button"
          variant="neutral"
          size="sm"
          onClick={onBackToChat}
        >
          <Sparkles aria-hidden data-icon="inline-start" />
          Ask about script
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onReview}
          disabled={
            reviewState.status === "validating" ||
            reviewState.status === "simulating"
          }
        >
          Review & execute
        </Button>
      </div>
    </section>
  );
}
