import {
  ArrowDownIcon,
  ArrowPathIcon,
  BeakerIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { Button, cn, IconButton } from "@repo/ui";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatItem } from "../../../ai/useChatAgent";
import { markdownComponents } from "../MarkdownComponents";
import { ChatSuggestions } from "./ChatSuggestions";
import { useStickToBottom } from "./useStickToBottom";

const WORKING_STATUSES = [
  "Liberating humanity...",
  "Banking the unbanked...",
  "We're all gonna make it...",
  "Don't trust, verify...",
  "Can devs do something?",
  "Probably nothing...",
  "Not your keys, not your coins...",
  "Number go up...",
  "Wen lambo?",
  "In it for the tech...",
  "1 BTC = 1 BTC...",
  "We are coming, and we are coming in waves!",
  "Funds are safu...",
  "Still so early...",
  "BUIDLing...",
];

const PROSE_CLASSES =
  "prose prose-invert prose-base max-w-none break-words prose-headings:text-foreground prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-pre:overflow-x-auto prose-li:text-foreground/80";

function CopyButton({
  text,
  alwaysVisible,
}: {
  text: string;
  alwaysVisible: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <IconButton
      type="button"
      aria-label="Copy message"
      variant="ghost"
      size="sm"
      className={cn(
        "absolute right-0 top-0 transition-opacity",
        alwaysVisible
          ? "opacity-70"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      )}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <CheckIcon className="w-4 h-4 text-evm-green-300" />
      ) : (
        <ClipboardIcon className="w-4 h-4" />
      )}
    </IconButton>
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_script: "Reading script",
  edit_script: "Updating script",
  write_script: "Writing script",
  set_script_title: "Naming script",
  validate_script: "Validating script",
  simulate_script: "Simulating on a fork",
  list_modules: "Checking modules",
  describe_module: "Reading module reference",
  get_docs: "Reading documentation",
  get_contract: "Inspecting contract",
  search_web: "Searching trusted sources",
  fetch_page: "Reading source",
};

function ToolItem({
  item,
  latestRevisionId,
  onOpenScript,
  onReview,
  onUndoRevision,
}: {
  item: Extract<ChatItem, { role: "tool" }>;
  latestRevisionId?: string;
  onOpenScript?: () => void;
  onReview?: () => void;
  onUndoRevision: (revisionId: string) => void;
}) {
  const artifact = item.artifact;

  if (!artifact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border border-foreground/10 bg-foreground/[0.025] px-3 py-2 font-mono text-xs text-foreground/55",
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

  if (artifact.kind === "script-change") {
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
              {artifact.undone
                ? "Script change undone"
                : artifact.ok
                  ? "Script updated"
                  : "Script update failed"}
            </p>
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
        <div className="mt-3 flex flex-wrap gap-2">
          {artifact.ok && onOpenScript && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenScript}
            >
              View script
            </Button>
          )}
          {/* Only the newest revision can actually be undone — older cards
              would always error with "the script changed". */}
          {artifact.revisionId &&
            !artifact.undone &&
            artifact.revisionId === latestRevisionId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onUndoRevision(artifact.revisionId!)}
              >
                Undo change
              </Button>
            )}
        </div>
      </article>
    );
  }

  if (artifact.kind === "simulation") {
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
            <p className="font-sans text-xs text-foreground/55">
              {artifact.error ??
                `${artifact.actionCount} action${artifact.actionCount === 1 ? "" : "s"} resolved on a fork`}
            </p>
          </div>
          {artifact.success && (
            <CheckCircleIcon className="size-5 text-primary" />
          )}
        </div>
        {artifact.success && onReview && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={onReview}
          >
            Review transactions
          </Button>
        )}
      </article>
    );
  }

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

export function ChatMessageList({
  items,
  isRunning,
  error,
  isAuthError,
  onShowSettings,
  onRegenerate,
  onSuggestion,
  onOpenScript,
  onReview,
  onUndoRevision,
  mobile = false,
}: {
  items: ChatItem[];
  isRunning: boolean;
  error: string | null;
  isAuthError: boolean;
  onShowSettings: () => void;
  onRegenerate: () => void;
  onSuggestion: (text: string) => void;
  onOpenScript?: () => void;
  onReview?: () => void;
  onUndoRevision: (revisionId: string) => void;
  mobile?: boolean;
}) {
  const [statusIdx, setStatusIdx] = useState(0);
  const { listRef, onScroll, isAtBottom, scrollToBottom } = useStickToBottom(
    items,
    isRunning,
  );

  useEffect(() => {
    if (!isRunning) return;
    setStatusIdx(Math.floor(Math.random() * WORKING_STATUSES.length));
    const id = setInterval(
      () => setStatusIdx((i) => (i + 1) % WORKING_STATUSES.length),
      3000,
    );
    return () => clearInterval(id);
  }, [isRunning]);

  const lastAssistantIdx = items.map((i) => i.role).lastIndexOf("assistant");

  let latestRevisionId: string | undefined;
  for (let i = items.length - 1; i >= 0 && !latestRevisionId; i--) {
    const it = items[i];
    if (it.role === "tool" && it.artifact?.kind === "script-change")
      latestRevisionId = it.artifact.revisionId;
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={listRef}
        onScroll={onScroll}
        className={cn(
          "h-full min-w-0 overflow-y-auto overflow-x-hidden px-2 py-2",
          mobile ? "flex flex-col gap-4 px-4 py-5" : "flex flex-col gap-3",
        )}
      >
        {items.length === 0 && (
          <div className="flex h-full flex-col">
            <p className="font-sans text-xl font-semibold leading-tight text-foreground">
              What do you want to do on-chain?
            </p>
            <p className="mt-2 max-w-sm font-sans text-sm leading-relaxed text-foreground/55">
              Describe it in plain words. I’ll write the script, check it, and
              simulate it before anything runs for real.
            </p>
            <p className="mt-3 border-l-2 border-primary/50 pl-3 font-sans text-xs text-foreground/45">
              Nothing reaches your wallet until you review and confirm.
            </p>
            <div className="mt-auto pt-3">
              <ChatSuggestions onPick={onSuggestion} />
            </div>
          </div>
        )}
        {items.map((item, i) => {
          if (item.role === "user") {
            return (
              <div
                key={i}
                className="rounded-md bg-foreground/10 px-3 py-2 text-base text-foreground whitespace-pre-wrap break-words"
              >
                {item.text}
              </div>
            );
          }
          if (item.role === "tool") {
            return (
              <ToolItem
                key={item.toolCallId ?? i}
                item={item}
                latestRevisionId={latestRevisionId}
                onOpenScript={onOpenScript}
                onReview={onReview}
                onUndoRevision={onUndoRevision}
              />
            );
          }
          return (
            <div key={i} className="group relative">
              <CopyButton text={item.text} alwaysVisible={mobile} />
              <div className={PROSE_CLASSES}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {item.text}
                </ReactMarkdown>
              </div>
              {i === lastAssistantIdx &&
                i === items.length - 1 &&
                !isRunning && (
                  <IconButton
                    type="button"
                    aria-label="Regenerate response"
                    variant="ghost"
                    size="sm"
                    className="mt-1 text-foreground/50"
                    onClick={onRegenerate}
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                  </IconButton>
                )}
            </div>
          );
        })}
        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <img
              src="/dappnode-logo.svg"
              alt=""
              className="size-5 animate-[spin_2s_linear_infinite]"
            />
            <span className="animate-pulse">{WORKING_STATUSES[statusIdx]}</span>
          </div>
        )}
        {error && (
          <p className="text-base text-red-400 break-words">
            {error}
            {isAuthError && (
              <>
                {" "}
                Update it in{" "}
                <button
                  type="button"
                  onClick={onShowSettings}
                  className="inline-flex items-center gap-1 align-baseline text-evm-green-300 hover:underline"
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                  Chat Settings
                </button>
                .
              </>
            )}
          </p>
        )}
      </div>
      {!isAtBottom && items.length > 0 && (
        <IconButton
          type="button"
          aria-label="Scroll to bottom"
          variant="outline"
          size="sm"
          className="absolute bottom-3 right-3 rounded-full bg-background/90"
          onClick={scrollToBottom}
        >
          <ArrowDownIcon className="w-4 h-4" />
        </IconButton>
      )}
    </div>
  );
}
