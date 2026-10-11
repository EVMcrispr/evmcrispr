import type { ChatItem } from "@evmcrispr/ai";
import {
  BeakerIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { Button, cn } from "@repo/ui";
import { useState } from "react";
import { PermissionPrompt } from "./PermissionPrompt";

/** What the cards can do. Each is the user's own click. */
export interface CardActions {
  /** Mobile: show the script. */
  onOpenScript?: () => void;
  /** Mobile: open the review of the script on screen. */
  onReview?: () => void;
  /** Shows the timeline of the space a change landed in. */
  onSeeInTimeline?: (space?: string) => void;
  /** Makes a space of a snippet the assistant ran. */
  onOpenInNewSpace?: (code: string) => void;
  /** Loads a snippet as the script of the space on screen. */
  onLoadInEditor?: (code: string) => void;
}

const TOOL_LABELS: Record<string, string> = {
  get_script: "Reading script",
  edit_script: "Updating script",
  write_script: "Writing script",
  validate_script: "Validating script",
  simulate_script: "Simulating on a fork",
  list_spaces: "Listing spaces",
  read_space: "Reading a space",
  list_modules: "Checking modules",
  describe_module: "Reading module reference",
  get_docs: "Reading documentation",
  get_contract: "Inspecting contract",
  search_web: "Searching trusted sources",
  fetch_page: "Reading source",
};

type ToolChatItem = Extract<ChatItem, { role: "tool" }>;
type Artifact = NonNullable<ToolChatItem["artifact"]>;

const PRE =
  "max-h-56 overflow-auto whitespace-pre-wrap wrap-break-word border border-foreground/10 bg-black/30 p-2 font-mono text-xs text-foreground/80";

/** A change to a script: what the assistant said it does, as plain text
 *  (it is a program's words, never rendered as anything else), and the
 *  way to the timeline, where the revision and its undo actions are. */
function ScriptChangeCard({
  artifact,
  actions,
}: {
  artifact: Extract<Artifact, { kind: "script-change" }>;
  actions: CardActions;
}) {
  const succeeded = artifact.ok && artifact.valid !== false;
  return (
    <article
      className={cn(
        "border bg-card/45 p-3",
        succeeded ? "border-primary/40" : "border-destructive/50",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center border border-foreground/15 bg-black/30">
          <CodeBracketIcon className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-semibold text-foreground">
            {artifact.ok ? "Script updated" : "Script update failed"}
          </p>
          {artifact.ok && artifact.explanation && (
            <p className="mt-0.5 wrap-break-word font-sans text-sm text-foreground/80">
              {artifact.explanation}
            </p>
          )}
          <p className="mt-0.5 font-sans text-xs text-foreground/55">
            {artifact.error ??
              (artifact.valid === false
                ? `${artifact.diagnosticsCount ?? 0} validation issue(s)`
                : "Validated and ready to inspect")}
          </p>
        </div>
        {succeeded ? (
          <CheckCircleIcon className="size-5 shrink-0 text-primary" />
        ) : (
          <ExclamationTriangleIcon className="size-5 shrink-0 text-destructive" />
        )}
      </div>
      {artifact.ok && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.onSeeInTimeline && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => actions.onSeeInTimeline?.(artifact.space)}
            >
              See in timeline
            </Button>
          )}
          {actions.onOpenScript && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={actions.onOpenScript}
            >
              View script
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/** A simulation, with what ran: the assistant's working, kept in the chat. */
function SimulationCard({
  artifact,
  actions,
}: {
  artifact: Extract<Artifact, { kind: "simulation" }>;
  actions: CardActions;
}) {
  const [open, setOpen] = useState(false);
  const { code, target } = artifact;
  const count = `${artifact.actionCount} action${artifact.actionCount === 1 ? "" : "s"} resolved on a fork`;
  return (
    <article
      className={cn(
        "border bg-card/45 p-3",
        artifact.success ? "border-primary/40" : "border-destructive/50",
      )}
    >
      <div className="flex items-center gap-3">
        <BeakerIcon className="size-6 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-semibold text-foreground">
            {artifact.success ? "Simulation passed" : "Simulation failed"}
          </p>
          <p className="wrap-break-word font-sans text-xs text-foreground/55">
            {target &&
              `${target === "snippet" ? "Ran a snippet" : "Ran the script"} · `}
            {artifact.error ?? count}
          </p>
        </div>
        {artifact.success && (
          <CheckCircleIcon className="size-5 text-primary" />
        )}
      </div>
      {code !== undefined && (
        <button
          type="button"
          aria-expanded={open}
          className="mt-2 flex cursor-pointer items-center gap-1 font-sans text-xs text-foreground/60 outline-hidden hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(!open)}
        >
          <ChevronRightIcon
            className={cn("size-3 transition-transform", open && "rotate-90")}
          />
          Code and logs
        </button>
      )}
      {open && code !== undefined && (
        <div className="mt-2 flex flex-col gap-2">
          <pre className={PRE} data-part="code">
            {code}
          </pre>
          <pre className={PRE} data-part="logs">
            {artifact.logs?.length ? artifact.logs.join("\n") : "No output"}
          </pre>
          {target === "snippet" && (
            <div className="flex flex-wrap gap-2">
              {actions.onLoadInEditor && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => actions.onLoadInEditor?.(code)}
                >
                  Load in editor
                </Button>
              )}
              {actions.onOpenInNewSpace && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => actions.onOpenInNewSpace?.(code)}
                >
                  Open in new space
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {/* A snippet passing says nothing about the script. */}
      {artifact.success && target === "script" && actions.onReview && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={actions.onReview}
        >
          Review transactions
        </Button>
      )}
    </article>
  );
}

/** One tool call in the chat: a line while it has nothing to show, a card
 *  when it left something. */
export function ToolCard({
  item,
  actions,
  chatId,
}: {
  item: ToolChatItem;
  actions: CardActions;
  /** The chat the card is in. */
  chatId: string;
}) {
  const artifact = item.artifact;

  if (!artifact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border border-foreground/10 bg-foreground/2.5 px-3 py-2 font-mono text-xs text-foreground/55",
          item.phase === "error" && "border-destructive/50 text-destructive",
        )}
        role={item.phase === "error" ? "alert" : "status"}
      >
        <span
          className={cn(
            "size-1.5 rounded-full bg-foreground/30",
            item.phase === "call" && "animate-pulse bg-primary",
          )}
        />
        <span>{TOOL_LABELS[item.text] ?? item.text.replaceAll("_", " ")}</span>
        {item.phase === "result" && (
          <CheckIcon className="ml-auto size-3.5 text-primary" />
        )}
        {item.error && <span className="ml-auto truncate">{item.error}</span>}
      </div>
    );
  }

  if (artifact.kind === "permission")
    return (
      <PermissionPrompt
        chatId={chatId}
        ask={
          artifact.what === "edit"
            ? { what: "edit", space: artifact.space ?? "" }
            : { what: "web" }
        }
      />
    );
  if (artifact.kind === "script-change")
    return <ScriptChangeCard artifact={artifact} actions={actions} />;
  if (artifact.kind === "simulation")
    return <SimulationCard artifact={artifact} actions={actions} />;

  return (
    <div className="flex items-center gap-2 border border-foreground/10 bg-card/35 px-3 py-2 font-sans text-sm">
      {artifact.valid ? (
        <CheckCircleIcon className="size-5 text-primary" />
      ) : (
        <ExclamationTriangleIcon className="size-5 text-destructive" />
      )}
      <span>
        {artifact.valid
          ? "Script is valid"
          : `${artifact.diagnosticsCount} validation issue(s)`}
      </span>
    </div>
  );
}
