import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  StopIcon,
} from "@heroicons/react/24/solid";
import { Button, IconButton, Input } from "@repo/ui";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useChatAgent } from "../../ai/useChatAgent";
import { markdownComponents } from "./MarkdownComponents";

const PROSE_CLASSES =
  "prose prose-invert prose-base max-w-none break-words prose-headings:text-foreground prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-pre:overflow-x-auto prose-li:text-foreground/80";

function ApiKeyForm({
  onSave,
  onBack,
}: {
  onSave: (key: string) => void;
  onBack?: () => void;
}) {
  const [key, setKey] = useState("");

  return (
    <form
      className="flex flex-col gap-3 px-2 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = key.trim();
        if (trimmed) onSave(trimmed);
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground transition-colors self-start"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
      )}
      <h2 className="text-xl font-head text-foreground">Chat settings</h2>
      <p className="text-sm text-foreground/70">
        Enter your Dappnode Nexus API key to chat with an assistant that can
        read, edit, validate and simulate the script in the editor.
      </p>
      <p className="text-sm text-foreground/70">
        New to Nexus? You have 5€ in free AI tokens waiting —{" "}
        <a
          href="https://nexus.dappnode.com/?promo=TRYNEXUS&utm_source=evmcrispr&utm_medium=referral&utm_campaign=nexus-chat-launch-2026-06&utm_content=chat-settings&utm_term=trynexuschat-promo"
          target="_blank"
          rel="noopener noreferrer"
          className="text-evm-green-300 hover:underline"
        >
          claim them here
        </a>
        .
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="Nexus API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          className="flex-1"
        />
        <Button type="submit" disabled={!key.trim()}>
          Save
        </Button>
      </div>
      <p className="text-xs text-foreground/40">
        The key is stored only in your browser's localStorage and sent only to
        nexus-api.dappnode.com.
      </p>
    </form>
  );
}

export function ChatPanel() {
  const {
    hasKey,
    setApiKey,
    items,
    isRunning,
    error,
    isAuthError,
    send,
    stop,
  } = useChatAgent();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items]);

  if (!hasKey || showSettings)
    return (
      <ApiKeyForm
        onSave={(key) => {
          setApiKey(key);
          setShowSettings(false);
        }}
        onBack={hasKey ? () => setShowSettings(false) : undefined}
      />
    );

  return (
    <div className="flex flex-col h-full">
      <div
        ref={listRef}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-3"
      >
        {items.length === 0 && (
          <p className="text-base text-foreground/40">
            Ask anything about the script in the editor — the assistant can
            read, edit, validate and simulate it. Manage your API key in{" "}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-1 align-baseline text-evm-green-300 hover:underline"
            >
              <Cog6ToothIcon className="w-4 h-4" />
              Chat Settings
            </button>
            .
          </p>
        )}
        {items.map((item, i) => {
          if (item.role === "user") {
            return (
              <div
                key={i}
                className="text-base text-foreground bg-foreground/10 rounded-md px-3 py-2 whitespace-pre-wrap break-words"
              >
                {item.text}
              </div>
            );
          }
          if (item.role === "tool") {
            return (
              <div
                key={i}
                className="text-xs text-foreground/50 font-mono break-words"
              >
                ⚙ {item.text}
              </div>
            );
          }
          return (
            <div key={i} className={PROSE_CLASSES}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {item.text}
              </ReactMarkdown>
            </div>
          );
        })}
        {error && (
          <p className="text-base text-red-400 break-words">
            {error}
            {isAuthError && (
              <>
                {" "}
                Update it in{" "}
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
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
      <form
        className="flex gap-2 px-2 py-2 pb-5 border-t border-foreground/10 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          const text = input.trim();
          if (!text || isRunning) return;
          setInput("");
          void send(text);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isRunning ? "Working..." : "Ask about the script..."}
          disabled={isRunning}
          className="flex-1"
        />
        {isRunning ? (
          <IconButton
            type="button"
            aria-label="Stop"
            variant="outline"
            size="md"
            onClick={stop}
          >
            <StopIcon className="w-5 h-5" />
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            aria-label="Send"
            size="md"
            disabled={!input.trim()}
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </IconButton>
        )}
      </form>
    </div>
  );
}
