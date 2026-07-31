import type { HoverRef } from "@evmcrispr/core";
import { Viewer } from "@evmcrispr/editor";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  LockClosedIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button, IconButton, toast } from "@repo/ui";
import type { TerminalEntryIntent } from "../../hooks/useTerminalScript";
import type { TransactionReviewState } from "../../hooks/useTransactionReview";
import { terminalStoreActions } from "../../stores/terminal-store";
import ShareScriptButton from "../scripts/ShareScriptButton";

function reviewLabel(state: TransactionReviewState) {
  if (state.status === "validating") return "Validating";
  if (state.status === "simulating") return "Simulating";
  if (state.status === "ready") return "Simulation passed";
  if (state.status === "valid") return "Valid";
  return "Not reviewed";
}

export function ScriptSheet({
  title,
  script,
  executingLine,
  entryIntent,
  sharedEncrypted = false,
  reviewState,
  onBackToChat,
  onReview,
  onOpenDocs,
}: {
  title: string;
  script: string;
  executingLine: number | null;
  entryIntent: TerminalEntryIntent;
  sharedEncrypted?: boolean;
  reviewState: TransactionReviewState;
  onBackToChat: () => void;
  onReview: () => void;
  onOpenDocs?: (ref: HoverRef) => void;
}) {
  const isReady =
    reviewState.status === "valid" || reviewState.status === "ready";

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Script review"
    >
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-start gap-3">
          {entryIntent === "author" && (
            <IconButton
              type="button"
              aria-label="Back to chat"
              variant="ghost"
              size="lg"
              className="min-h-11 min-w-11"
              onClick={onBackToChat}
            >
              <ArrowLeftIcon className="size-5" />
            </IconButton>
          )}
          <div className="min-w-0 flex-1">
            {entryIntent === "author" ? (
              <input
                aria-label="Script title"
                value={title}
                placeholder="Untitled script"
                className="w-full border-b border-transparent bg-transparent font-sans text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-foreground/35 focus:border-foreground/30"
                onChange={(event) =>
                  terminalStoreActions("title", event.target.value)
                }
              />
            ) : (
              <h1 className="truncate font-sans text-2xl font-semibold tracking-tight text-foreground">
                {title || "Untitled script"}
              </h1>
            )}
            {entryIntent === "recipient" ? (
              <p className="mt-1 flex items-center gap-1.5 font-sans text-xs text-foreground/50">
                {/* Only encrypted share envelopes may claim encryption —
                    plain pins and bare JSON envelopes are public. */}
                {sharedEncrypted && <LockClosedIcon className="size-3.5" />}
                {sharedEncrypted
                  ? "Shared with you · Encrypted link"
                  : "Shared with you"}
              </p>
            ) : (
              <p className="mt-1 font-sans text-xs text-foreground/45">
                Read-only here · edit through chat
              </p>
            )}
          </div>
          <ShareScriptButton mobile title={title} script={script} />
          <IconButton
            type="button"
            aria-label="Copy script"
            variant="outline"
            size="sm"
            className="min-h-9 min-w-9 shadow-none"
            onClick={() => {
              void navigator.clipboard.writeText(script);
              toast.success("Script copied");
            }}
          >
            <ClipboardDocumentIcon className="size-4" />
          </IconButton>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {reviewState.status !== "error" && (
            <div
              className={`flex min-h-9 items-center gap-1.5 border px-2.5 font-sans text-xs ${
                isReady
                  ? "border-primary/40 text-primary"
                  : "border-foreground/15 text-foreground/55"
              }`}
              role="status"
            >
              <CheckCircleIcon className="size-4" />
              {reviewLabel(reviewState)}
            </div>
          )}
          {reviewState.status === "ready" && (
            <span className="font-sans text-xs text-foreground/45">
              {reviewState.actions.length} resolved action
              {reviewState.actions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="mx-4 flex min-h-0 flex-1 flex-col overflow-hidden border border-foreground/15 bg-black/55 shadow-[0_18px_70px_rgba(0,0,0,0.38)]">
        <div className="flex h-9 items-center justify-between border-b border-foreground/10 bg-foreground/[0.035] px-3">
          <span className="font-mono text-xs font-semibold text-primary">
            EVML SCRIPT
          </span>
          <span className="font-mono text-[10px] text-foreground/35">
            READ ONLY
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <Viewer
            script={script}
            executingLine={executingLine}
            onOpenDocs={onOpenDocs}
          />
        </div>
      </div>

      <div className="mx-4 mt-3 flex shrink-0 items-center gap-2 border border-primary/25 bg-primary/[0.055] px-3 py-2">
        <CheckCircleIcon className="size-5 shrink-0 text-primary" />
        <p className="font-sans text-xs text-foreground/65">
          Nothing is sent until you review and confirm in your wallet.
        </p>
      </div>

      <div className="mobile-safe-bottom grid shrink-0 grid-cols-2 gap-2 px-4 pb-3 pt-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-12 gap-2 border-foreground/20 px-3 font-sans text-xs shadow-none"
          onClick={onBackToChat}
        >
          <SparklesIcon data-icon="inline-start" />
          Ask about script
        </Button>
        <Button
          type="button"
          className="min-h-12 px-3 font-sans text-xs shadow-none"
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
