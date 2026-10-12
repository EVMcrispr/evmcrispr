import type { ChatItem } from "@evmcrispr/ai";
import { Badge, Button, Card, cn, Dot, Notice, Well } from "@repo/ui";
import { Check, ChevronRight } from "@repo/ui/icons";
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
    <Card as="article" tone={succeeded ? "neutral" : "danger"}>
      <Card.Header
        title={artifact.ok ? "Script updated" : "Script update failed"}
        status={
          <Badge tone={succeeded ? "success" : "danger"}>
            {artifact.error
              ? "failed"
              : artifact.valid === false
                ? `${artifact.diagnosticsCount ?? 0} validation issue(s)`
                : "validated"}
          </Badge>
        }
      />
      <Card.Body>
        {artifact.ok && artifact.explanation && (
          <p className="m-0 wrap-break-word text-fg">{artifact.explanation}</p>
        )}
        <p className="m-0 text-caption text-fg-faint">
          {artifact.error ??
            (artifact.valid === false
              ? `${artifact.diagnosticsCount ?? 0} validation issue(s)`
              : "Validated and ready to inspect")}
        </p>
      </Card.Body>
      {artifact.ok && (actions.onSeeInTimeline || actions.onOpenScript) && (
        <Card.Footer>
          {actions.onSeeInTimeline && (
            <Button
              type="button"
              size="sm"
              variant="quiet"
              onClick={() => actions.onSeeInTimeline?.(artifact.space)}
            >
              See in timeline
            </Button>
          )}
          {actions.onOpenScript && (
            <Button
              type="button"
              size="sm"
              variant="quiet"
              onClick={actions.onOpenScript}
            >
              View script
            </Button>
          )}
        </Card.Footer>
      )}
    </Card>
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
  // A snippet passing says nothing about the script.
  const review = artifact.success && target === "script" && actions.onReview;
  return (
    <Card as="article" tone={artifact.success ? "neutral" : "danger"}>
      <Card.Header
        title={artifact.success ? "Simulation passed" : "Simulation failed"}
        status={
          <Badge tone={artifact.success ? "success" : "danger"}>
            {target === "snippet" ? "a snippet" : "the script"}
          </Badge>
        }
      />
      <Card.Body>
        <p className="m-0 wrap-break-word text-caption text-fg-faint">
          {target &&
            `${target === "snippet" ? "Ran a snippet" : "Ran the script"} · `}
          {artifact.error ?? count}
        </p>
        {code !== undefined && (
          <div>
            <Button
              type="button"
              variant="link"
              size="row"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <ChevronRight
                aria-hidden
                data-icon
                className={cn("transition-transform", open && "rotate-90")}
              />
              Code and logs
            </Button>
          </div>
        )}
        {open && code !== undefined && (
          <>
            <Well data-part="code">{code}</Well>
            <Well data-part="logs">
              {artifact.logs?.length ? artifact.logs.join("\n") : "No output"}
            </Well>
            {target === "snippet" && (
              <div className="flex flex-wrap gap-2">
                {actions.onLoadInEditor && (
                  <Button
                    type="button"
                    size="sm"
                    variant="quiet"
                    onClick={() => actions.onLoadInEditor?.(code)}
                  >
                    Load in editor
                  </Button>
                )}
                {actions.onOpenInNewSpace && (
                  <Button
                    type="button"
                    size="sm"
                    variant="quiet"
                    onClick={() => actions.onOpenInNewSpace?.(code)}
                  >
                    Open in new space
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Card.Body>
      {review && (
        <Card.Footer>
          <Button
            type="button"
            size="sm"
            variant="neutral"
            onClick={actions.onReview}
          >
            Review transactions
          </Button>
        </Card.Footer>
      )}
    </Card>
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
    const failed = item.phase === "error";
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-2 px-2.5 py-1.5 font-mono text-caption",
          failed
            ? "border-danger bg-danger-surface text-danger"
            : "border-line bg-surface-1 text-fg-faint",
        )}
        role={failed ? "alert" : "status"}
      >
        <Dot
          tone={failed ? "danger" : item.phase === "call" ? "info" : "neutral"}
          className={cn(item.phase === "call" && "animate-pulse")}
        />
        <span>{TOOL_LABELS[item.text] ?? item.text.replaceAll("_", " ")}</span>
        {item.phase === "result" && (
          <Check aria-hidden className="ml-auto size-3.5 text-success" />
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
    <Notice tone={artifact.valid ? "success" : "danger"}>
      {artifact.valid
        ? "Script is valid"
        : `${artifact.diagnosticsCount} validation issue(s)`}
    </Notice>
  );
}
