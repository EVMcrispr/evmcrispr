import { Button, Input } from "@repo/ui";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useChatAgent } from "../../ai/useChatAgent";
import { markdownComponents } from "./MarkdownComponents";

const PROSE_CLASSES =
  "prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-li:text-foreground/80";

function ApiKeyForm({ onSave }: { onSave: (key: string) => void }) {
  const [key, setKey] = useState("");

  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = key.trim();
        if (trimmed) onSave(trimmed);
      }}
    >
      <p className="text-sm text-foreground/70">
        Enter your Anthropic API key to chat with an assistant that can read,
        edit, validate and simulate the script in the editor.
      </p>
      <Input
        type="password"
        placeholder="sk-ant-..."
        value={key}
        onChange={(e) => setKey(e.target.value)}
        autoComplete="off"
      />
      <Button type="submit" disabled={!key.trim()}>
        Save key
      </Button>
      <p className="text-xs text-foreground/40">
        The key is stored only in your browser's localStorage and sent only to
        api.anthropic.com.
      </p>
    </form>
  );
}

export function ChatPanel() {
  const {
    hasKey,
    setApiKey,
    clearApiKey,
    items,
    isRunning,
    error,
    send,
    stop,
  } = useChatAgent();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items]);

  if (!hasKey) return <ApiKeyForm onSave={setApiKey} />;

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-foreground/40">
            Ask anything about the script in the editor — the assistant can
            read, edit, validate and simulate it.
          </p>
        )}
        {items.map((item, i) => {
          if (item.role === "user") {
            return (
              <div
                key={i}
                className="text-sm text-foreground bg-foreground/10 rounded-md px-3 py-2 whitespace-pre-wrap"
              >
                {item.text}
              </div>
            );
          }
          if (item.role === "tool") {
            return (
              <div key={i} className="text-xs text-foreground/50 font-mono">
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
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
      <form
        className="flex gap-2 p-2 border-t border-foreground/10 shrink-0"
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
          <Button type="button" variant="outline" size="sm" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={!input.trim()}>
            Send
          </Button>
        )}
      </form>
      <button
        type="button"
        onClick={clearApiKey}
        className="text-xs text-foreground/30 hover:text-foreground/60 pb-1 self-center"
      >
        change API key
      </button>
    </div>
  );
}
