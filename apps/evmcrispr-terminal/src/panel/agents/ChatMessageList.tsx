import type { ChatErrorInfo, ChatItem } from "@evmcrispr/ai";
import {
  ArrowDownIcon,
  ArrowPathIcon,
  CheckIcon,
  ClipboardIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/solid";
import { cn, IconButton } from "@repo/ui";
import { type CSSProperties, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../reference/MarkdownComponents";
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

const PROSE_CLASSES =
  "prose prose-invert prose-base max-w-none wrap-break-word prose-headings:text-foreground prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:wrap-break-word prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-pre:overflow-x-auto prose-li:text-foreground/80";

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
                className="rounded-md bg-foreground/10 px-3 py-2 text-base text-foreground whitespace-pre-wrap wrap-break-word"
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
          <p className="text-base text-red-400 wrap-break-word">
            {error.message}
            {/* An auth failure drops the key, so the panel has already
                swapped to the settings screen — the only banner that still
                needs a way out is the empty-balance one, and Recharge lives
                in the same place. */}
            {error.kind === "balance" && (
              <>
                {" "}
                Recharge in{" "}
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
