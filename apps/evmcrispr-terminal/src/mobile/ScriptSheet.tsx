import type { HoverRef } from "@evmcrispr/core";
import { Button, IconButton, ScriptFrame, toast } from "@repo/ui";
import { Copy, Lock, MessagesSquare, X } from "@repo/ui/icons";
import { SCRIPT_MORPH, TITLE_MORPH } from "../app/morph";
import { useScript, useUnreviewed } from "../app/SpaceContext";
import { ScriptView } from "../editor/ScriptView";
import { CheckBadge, UnreviewedBadge } from "../review/state";
import type { Simulation } from "../review/useReview";

export function ScriptSheet({
  entryIntent,
  sharedEncrypted = false,
  simulation,
  onBack,
  onAsk,
  onSimulate,
  onOpenDocs,
}: {
  entryIntent: "author" | "recipient";
  sharedEncrypted?: boolean;
  simulation: Simulation;
  /** To the timeline of the space, where the script was opened from. */
  onBack: () => void;
  /** To the chat, to ask about the script. */
  onAsk: () => void;
  /** Opens the simulation; while the script is unreviewed, the review of
   *  its changes, which comes first. */
  onSimulate: () => void;
  onOpenDocs?: (ref: HoverRef) => void;
}) {
  const { title, text: script } = useScript();
  const unreviewed = useUnreviewed();

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Script">
      <ScriptFrame
        className="mx-3 mt-3 flex-1"
        transitionName={SCRIPT_MORPH}
        titleTransitionName={TITLE_MORPH}
        title={title || "Untitled script"}
        meta={
          <>
            {entryIntent === "recipient" ? (
              <span className="flex items-center gap-1.5">
                {/* Only encrypted share envelopes may claim encryption —
                    plain pins and bare JSON envelopes are public. */}
                {sharedEncrypted && <Lock aria-hidden className="size-3.5" />}
                {sharedEncrypted
                  ? "Shared with you · Encrypted link"
                  : "Shared with you"}
              </span>
            ) : (
              <span>Read-only here · edit through chat</span>
            )}
            {unreviewed && <UnreviewedBadge dot />}
            {/* In the line, after its state: the icon alone, so the line
                stays one line on a phone. */}
            <IconButton
              type="button"
              aria-label="Copy script"
              variant="ghost"
              size="sm"
              className="-my-2"
              onClick={() => {
                void navigator.clipboard.writeText(script);
                toast.success("Script copied");
              }}
            >
              <Copy aria-hidden className="size-4" />
            </IconButton>
            <CheckBadge simulation={simulation} />
            {simulation.status === "ready" && (
              <span>
                {simulation.actions.length} resolved action
                {simulation.actions.length === 1 ? "" : "s"}
              </span>
            )}
          </>
        }
        // The way out is at the end of the title's line.
        actions={
          <IconButton
            type="button"
            aria-label="Back to timeline"
            variant="quiet"
            size="sm"
            onClick={onBack}
          >
            <X aria-hidden />
          </IconButton>
        }
        footer={
          <span className="text-fg-muted">
            Nothing is sent until you review and confirm in your wallet.
          </span>
        }
      >
        <ScriptView onOpenDocs={onOpenDocs} />
      </ScriptFrame>

      <div className="mobile-safe-bottom grid shrink-0 grid-cols-2 gap-3 px-3 pt-3 pb-3">
        <Button type="button" variant="neutral" size="sm" onClick={onAsk}>
          <MessagesSquare aria-hidden data-icon="inline-start" />
          Back to chat
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSimulate}
          disabled={
            simulation.status === "validating" ||
            simulation.status === "simulating"
          }
        >
          {/* As beside the editor: an unapproved script is reviewed
              first, an approved one is simulated. */}
          {unreviewed ? "Review changes" : "Simulate & Run"}
        </Button>
      </div>
    </section>
  );
}
