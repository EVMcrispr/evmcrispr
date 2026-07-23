import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  StopIcon,
} from "@heroicons/react/24/solid";
import { Button, IconButton, Input } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  fetchNexusBalance,
  loginWithNexus,
  logoutNexus,
} from "../../ai/nexus-auth";
import { useChatAgent } from "../../ai/useChatAgent";
import { markdownComponents } from "./MarkdownComponents";

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

const NEXUS_URL =
  "https://nexus.dappnode.com/?utm_source=evmcrispr2026-07&utm_medium=referral";
const RECHARGE_URL =
  "https://nexus.dappnode.com/billing?utm_source=evmcrispr2026-07&utm_medium=referral";

const PROSE_CLASSES =
  "prose prose-invert prose-base max-w-none break-words prose-headings:text-foreground prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-pre:overflow-x-auto prose-li:text-foreground/80";

function ApiKeyForm({
  onSave,
  onBack,
  onDisconnect,
  balanceCents,
}: {
  onSave: (key: string) => void;
  onBack?: () => void;
  onDisconnect?: () => void;
  balanceCents?: number | null;
}) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const login = async () => {
    setLoginError(null);
    setLoggingIn(true);
    try {
      onSave(await loginWithNexus());
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-5 overflow-y-auto">
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

      <section className="flex flex-col gap-3">
        <h3 className="mt-3 flex items-center gap-2 text-base font-head text-evm-green-300">
          <img src="/dappnode-logo.svg" alt="" className="w-5 h-5" />
          DappNode Nexus assistant
        </h3>
        <p className="text-sm text-foreground/70">
          Chat with a built-in assistant that can read, edit, validate and
          simulate the script in the editor — powered by your{" "}
          <a
            href={NEXUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-evm-green-300 hover:underline"
          >
            DappNode Nexus account
          </a>
          .
        </p>
        {onDisconnect ? (
          <>
            {balanceCents != null && (
              <p className="text-sm text-foreground/70">
                Balance: €{(balanceCents / 100).toFixed(2)}
              </p>
            )}
            <div className="flex gap-2">
              <Button asChild size="sm">
                <a
                  href={RECHARGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Recharge
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground/70">
              New to DappNode Nexus? Sign up through the login and you get 5€ in
              free AI tokens.
            </p>
            <Button
              type="button"
              onClick={login}
              disabled={loggingIn}
              className="self-start"
            >
              <img src="/dappnode-logo.svg" alt="" className="w-5 h-5" />
              {loggingIn ? "Waiting for login..." : "Login with Dappnode Nexus"}
            </Button>
            {loginError && <p className="text-sm text-red-400">{loginError}</p>}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="mt-3 flex items-center gap-2 text-base font-head text-evm-green-300">
          <img src="/mcp-logo.svg" alt="" className="w-5 h-5" />
          Use your own AI
        </h3>
        <p className="text-sm text-foreground/70">
          Already use ChatGPT, Claude, or Cursor? Point it at EVMcrispr's MCP
          server and it can write, validate and simulate scripts for you.
        </p>
        <Button asChild size="sm" className="self-start">
          <a
            href="https://next-docs.evmcrispr.com/guides/mcp/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the MCP guide
          </a>
        </Button>
      </section>
    </div>
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
    isAuthError,
    send,
    stop,
  } = useChatAgent();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Refetches after each completed run (runs cost credits): re-enabling the
  // query when isRunning drops back to false refreshes the stale balance.
  const { data: balanceCents } = useQuery({
    queryKey: ["nexus-balance"],
    queryFn: fetchNexusBalance,
    enabled: hasKey && !isRunning,
  });

  useEffect(() => {
    if (!isRunning) return;
    setStatusIdx(Math.floor(Math.random() * WORKING_STATUSES.length));
    const id = setInterval(
      () => setStatusIdx((i) => (i + 1) % WORKING_STATUSES.length),
      3000,
    );
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (items.length === 0 && !isRunning) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items, isRunning]);

  if (!hasKey || showSettings)
    return (
      <ApiKeyForm
        onSave={(key) => {
          setApiKey(key);
          setShowSettings(false);
        }}
        onBack={hasKey ? () => setShowSettings(false) : undefined}
        balanceCents={balanceCents}
        onDisconnect={
          hasKey
            ? () => {
                void logoutNexus();
                clearApiKey();
                setShowSettings(false);
              }
            : undefined
        }
      />
    );

  return (
    <div className="flex flex-col h-full">
      {balanceCents != null && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-foreground/10 text-sm text-foreground/60 shrink-0">
          <img src="/dappnode-logo.svg" alt="" className="w-5 h-5" />
          <a
            href={NEXUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/80 hover:underline"
          >
            DappNode Nexus
          </a>
          <span className="ml-auto rounded-full bg-foreground/10 px-2.5 py-0.5 tabular-nums">
            €{(balanceCents / 100).toFixed(2)}
          </span>
          <IconButton
            type="button"
            aria-label="Chat settings"
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(true)}
          >
            <Cog6ToothIcon className="w-4 h-4" />
          </IconButton>
        </div>
      )}
      <div
        ref={listRef}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-3"
      >
        {items.length === 0 && (
          <p className="text-base text-foreground/40">
            Ask anything about the script in the editor — the assistant can
            read, edit, validate and simulate it.
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
