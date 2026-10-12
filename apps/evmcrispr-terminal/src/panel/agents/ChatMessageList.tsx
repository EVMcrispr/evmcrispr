import type { ChatErrorInfo, ChatItem } from "@evmcrispr/ai";
import { Button, cn, IconButton, Notice } from "@repo/ui";
import { ArrowDown, Check, Copy, RefreshCw, Settings } from "@repo/ui/icons";
import { type CSSProperties, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents, PROSE } from "../reference/MarkdownComponents";
import { ChatSuggestions } from "./ChatSuggestions";
import { type CardActions, ToolCard } from "./ToolCards";
import { useStickToBottom } from "./useStickToBottom";

// Depth positions (0 = back, 1 = front) of the stacked copies that give the
// working logo its thickness; see `.dappnode-tumble` in index.css.
const LOGO_LAYERS = Array.from({ length: 9 }, (_, i) => i / 8);

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
      variant="quiet"
      size="sm"
      className={cn(
        "transition-opacity",
        alwaysVisible
          ? "opacity-70"
          : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
      )}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check aria-hidden className="text-success" />
      ) : (
        <Copy aria-hidden />
      )}
    </IconButton>
  );
}

export function ChatMessageList({
  items,
  isRunning,
  error,
  onShowSettings,
  onRegenerate,
  onSuggestion,
  cards,
  chatId,
  mobile = false,
}: {
  chatId: string;
  items: ChatItem[];
  isRunning: boolean;
  error: ChatErrorInfo | null;
  onShowSettings: () => void;
  onRegenerate: () => void;
  onSuggestion: (text: string) => void;
  cards: CardActions;
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

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex h-full min-w-0 flex-col gap-3.5 overflow-x-hidden overflow-y-auto p-2.5 touch:gap-4 touch:px-4 touch:py-5"
      >
        {items.length === 0 && (
          <div className="flex h-full flex-col">
            <p className="m-0 font-head text-display font-bold text-fg">
              What do you want to do on-chain?
            </p>
            <p className="m-0 mt-2 max-w-sm font-sans text-body text-fg-muted">
              Describe it in plain words. I’ll write the script, check it, and
              simulate it before anything runs for real.
            </p>
            <p className="m-0 mt-3 border-l-2 border-primary pl-3 font-sans text-caption text-fg-faint">
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
                // What the user said: a framed block on their side.
                className="max-w-4/5 self-end whitespace-pre-wrap wrap-break-word border-2 border-edge bg-surface-active px-2.5 py-1.5 font-sans text-body text-fg"
              >
                {item.text}
              </div>
            );
          }
          if (item.role === "tool") {
            return (
              <ToolCard
                key={item.toolCallId ?? i}
                item={item}
                actions={cards}
                chatId={chatId}
              />
            );
          }
          return (
            <div key={i} className="group flex flex-col items-start">
              {/* What the assistant said: a framed block on its side. */}
              <div className="max-w-full border-2 border-line bg-surface-1 px-2.5 py-2">
                <div className={PROSE}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {item.text}
                  </ReactMarkdown>
                </div>
              </div>
              {/* Under the block, not over its text. */}
              <div className="mt-1 flex items-center gap-1">
                <CopyButton text={item.text} alwaysVisible={mobile} />
                {i === lastAssistantIdx &&
                  i === items.length - 1 &&
                  !isRunning && (
                    <IconButton
                      type="button"
                      aria-label="Regenerate response"
                      variant="quiet"
                      size="sm"
                      onClick={onRegenerate}
                    >
                      <RefreshCw aria-hidden />
                    </IconButton>
                  )}
              </div>
            </div>
          );
        })}
        {isRunning && (
          <div className="flex items-center gap-2 font-sans text-body text-fg-muted">
            <span className="dappnode-tumble size-5" aria-hidden="true">
              {LOGO_LAYERS.flatMap((i) => [
                <img
                  key={`front-${i}`}
                  src="/dappnode-logo.svg"
                  alt=""
                  className={cn(i < 1 && "inner")}
                  style={{ "--i": i } as CSSProperties}
                />,
                <img
                  key={`back-${i}`}
                  src="/dappnode-logo-back.svg"
                  alt=""
                  className={cn("back", i > 0 && "inner")}
                  style={{ "--i": i } as CSSProperties}
                />,
              ])}
            </span>
            <span className="animate-pulse">{WORKING_STATUSES[statusIdx]}</span>
          </div>
        )}
        {error && (
          <Notice
            tone="danger"
            // An auth failure drops the key, so the panel has already
            // swapped to the settings screen: the only error that still
            // needs a way out is the empty balance, and Recharge lives in
            // the same place.
            action={
              error.kind === "balance" ? (
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  onClick={onShowSettings}
                >
                  <Settings data-icon aria-hidden />
                  Chat Settings
                </Button>
              ) : undefined
            }
          >
            {error.message}
            {error.kind === "balance" && " Recharge in Chat Settings."}
          </Notice>
        )}
      </div>
      {!isAtBottom && items.length > 0 && (
        <IconButton
          type="button"
          aria-label="Scroll to bottom"
          variant="neutral"
          size="sm"
          className="absolute right-3 bottom-3"
          onClick={scrollToBottom}
        >
          <ArrowDown aria-hidden />
        </IconButton>
      )}
    </div>
  );
}
