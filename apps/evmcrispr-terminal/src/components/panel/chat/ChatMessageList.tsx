import {
  ArrowDownIcon,
  ArrowPathIcon,
  CheckIcon,
  ClipboardIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/solid";
import { IconButton } from "@repo/ui";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatError } from "../../../ai/nexus-errors";
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
  "prose prose-invert prose-base max-w-none wrap-break-word prose-headings:text-foreground prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:wrap-break-word prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-pre:overflow-x-auto prose-li:text-foreground/80";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <IconButton
      type="button"
      aria-label="Copy message"
      variant="ghost"
      size="sm"
      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
}: {
  items: ChatItem[];
  isRunning: boolean;
  error: ChatError | null;
  onShowSettings: () => void;
  onRegenerate: () => void;
  onSuggestion: (text: string) => void;
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
        className="h-full min-w-0 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-3"
      >
        {items.length === 0 && (
          <div className="flex flex-col h-full">
            <p className="text-base text-foreground/40">
              Ask anything about the script in the editor — the assistant can
              read, edit, validate and simulate it.
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
                className="text-base text-foreground bg-foreground/10 rounded-md px-3 py-2 whitespace-pre-wrap wrap-break-word"
              >
                {item.text}
              </div>
            );
          }
          if (item.role === "tool") {
            return (
              <div
                key={i}
                className="text-xs text-foreground/50 font-mono wrap-break-word"
              >
                ⚙ {item.text}
              </div>
            );
          }
          return (
            <div key={i} className="group relative">
              <CopyButton text={item.text} />
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
              className="w-5 h-5 animate-[spin_2s_linear_infinite]"
            />
            <span className="animate-pulse">{WORKING_STATUSES[statusIdx]}</span>
          </div>
        )}
        {error && (
          <p className="text-base text-red-400 wrap-break-word">
            {error.message}
            {/* An auth failure clears the key, so the panel has already
                swapped to the login screen and never gets here; a balance
                one keeps the session, and Recharge lives in settings. */}
            {error.kind === "balance" && (
              <>
                {" "}
                Recharge it from{" "}
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
