import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { useEvmlTag } from "@evmcrispr/editor";
import { APICallError, type ModelMessage, stepCountIs, streamText } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTerminalStore } from "../stores/terminal-store";
import { clearNexusApiKey, getNexusApiKey, saveNexusApiKey } from "../utils";
import { undoScriptRevision } from "../utils/script-edits";
import {
  deriveTitle,
  getChat,
  listChats,
  removeChat,
  saveChat,
} from "./chat-store";
import { createChatTools } from "./tools";

const NEXUS_BASE_URL = "https://nexus-api.dappnode.com/v1";
const MODEL = "moonshotai/kimi-k3";

// Nexus's CORS preflight allows only these request headers; the SDK also
// sets a (non-safelisted) user-agent, which makes browsers fail the whole
// preflight, so strip anything else before sending.
const ALLOWED_HEADERS = ["authorization", "content-type", "x-request-id"];
// Cast: bun's fetch type carries an extra preconnect property.
const corsSafeFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  for (const name of [...headers.keys()])
    if (!ALLOWED_HEADERS.includes(name)) headers.delete(name);
  return fetch(input, { ...init, headers });
}) as typeof fetch;

const SYSTEM_PROMPT = `You are an assistant embedded in the EVMcrispr terminal, an interface for EVML — a scripting language for batching EVM transactions. EVML scripts are line-based: commands like "switch <chain>", "load <module>", "set $var <value>", "exec <target> <signature> <args...>", module commands like "token:transfer", and inline helpers like @token(WETH), @me, @date(now). Comments start with #.

The user's script is managed by the terminal; you do not receive it automatically. Use get_script to read it, edit_script/write_script to change it, validate_script to check it, and simulate_script to dry-run it on a fork. On phones, chat is the only authoring surface and the script is always read-only. Edit results already include validation diagnostics — fix any errors they report before finishing. Scripts also have a title: after changing a script, make sure its title still describes it — set one with set_script_title if it is untitled, and update it if it no longer matches what the script does. Titles are a few words naming the script's overall purpose (not its exact parameters), broad enough that small edits don't call for a rename. Keep replies short; the script itself is the deliverable. Never claim that a transaction was sent: broadcasting always requires a separate user review and wallet confirmation.

You have the full EVML reference at hand: list_modules gives an overview of every module, describe_module lists a module's commands and helpers, and get_docs returns the full documentation of one command or helper (syntax, arguments, options, examples). Look up anything you are not certain about instead of guessing — especially before using a module command's options or a helper's argument order.

You can also read on-chain data: pass a throwaway script to simulate_script's script parameter and the output of any "print" commands appears in the simulation logs, without touching the editor. Helpers compose with space-separated arguments, so e.g. "load token" followed by "print @token:format(ETH @token:balance(ETH @ens(vitalik.eth)))" answers "what is vitalik.eth's ETH balance" with a human-readable string like "1.5 ETH". Use this whenever the user asks about balances, resolved names/addresses, or any other value a helper can compute.

Before writing an exec call against a specific contract, or when the user asks what a contract does, use get_contract to read its verified ABI and source from Etherscan (it flags proxies and lets you read files one by one) instead of guessing function signatures.

For external protocols, or anything the EVML docs tools and get_contract do not cover (e.g. how ENS name wrapping works, a protocol's contract addresses, an unfamiliar function signature), use search_web to find documentation and fetch_page to read it instead of guessing. Prefer official documentation over blogs, and cite the source URLs in your reply.`;

/**
 * Model-friendly local timestamp: weekday for relative-day reasoning, ISO
 * date to avoid day/month ambiguity, 24h time with an explicit UTC offset.
 * E.g. "Tuesday, 2026-07-28 19:55 (UTC+01:00)".
 */
function formatNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const offset = `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${weekday}, ${date} ${time} (${offset})`;
}

/** Computed per run so long-lived tabs don't drift. */
function systemPrompt(): string {
  return `${SYSTEM_PROMPT}\n\nThe current date and time is ${formatNow()}.`;
}

export type ChatToolArtifact =
  | {
      kind: "script-change";
      ok: boolean;
      valid?: boolean;
      diagnosticsCount?: number;
      revisionId?: string;
      error?: string;
      undone?: boolean;
    }
  | {
      kind: "validation";
      valid: boolean;
      diagnosticsCount: number;
    }
  | {
      kind: "simulation";
      success: boolean;
      actionCount: number;
      error?: string;
    };

export type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | {
      role: "tool";
      text: string;
      toolCallId?: string;
      phase?: "call" | "result" | "error";
      artifact?: ChatToolArtifact;
      error?: string;
    };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function toolArtifact(output: unknown): ChatToolArtifact | undefined {
  const value = record(output);
  if (!value || typeof value.kind !== "string") return undefined;

  if (value.kind === "script-change") {
    const validation = record(value.validation);
    const diagnostics = Array.isArray(validation?.diagnostics)
      ? validation.diagnostics
      : [];
    return {
      kind: "script-change",
      ok: value.ok === true,
      valid:
        validation && typeof validation.valid === "boolean"
          ? validation.valid
          : undefined,
      diagnosticsCount: validation ? diagnostics.length : undefined,
      revisionId:
        typeof value.revisionId === "string" ? value.revisionId : undefined,
      error: typeof value.error === "string" ? value.error : undefined,
    };
  }

  if (value.kind === "validation") {
    return {
      kind: "validation",
      valid: value.valid === true,
      diagnosticsCount: Array.isArray(value.diagnostics)
        ? value.diagnostics.length
        : 0,
    };
  }

  if (value.kind === "simulation") {
    const actions = Array.isArray(value.actions) ? value.actions : [];
    return {
      kind: "simulation",
      success: value.success === true,
      actionCount: actions.reduce((count, action) => {
        const item = record(action);
        return (
          count +
          (item?.type === "batched" && Array.isArray(item.actions)
            ? item.actions.length
            : 1)
        );
      }, 0),
      error: typeof value.error === "string" ? value.error : undefined,
    };
  }

  return undefined;
}

export function useChatAgent() {
  const tag = useEvmlTag();

  const [apiKey, setApiKeyState] = useState<string | null>(() =>
    getNexusApiKey(),
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  // Each page load starts a fresh conversation; old ones live in the history.
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );

  const historyRef = useRef<ModelMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  // A chat belongs to the script it was started under (script 1-N chats).
  // Captured here rather than read live so a run that outlasts a script
  // switch still persists under its own script.
  const currentScriptId = useTerminalStore((s) => s.currentScriptId);
  const chatScriptIdRef = useRef<string | null | undefined>(undefined);
  // Abort any in-flight run on unmount — an orphaned stream would keep
  // executing script-editing tools with no visible chat or Stop button.
  useEffect(() => () => abortRef.current?.abort(), []);
  // Mirrors `items` so async persistence sees the latest render list.
  const itemsRef = useRef<ChatItem[]>([]);
  const conversationIdRef = useRef(conversationId);

  const updateItems = useCallback(
    (updater: (prev: ChatItem[]) => ChatItem[]) => {
      // Update the ref eagerly (not inside the setItems updater): persist()
      // runs right after updateItems and must see the new list even when
      // React defers the state updater.
      itemsRef.current = updater(itemsRef.current);
      setItems(itemsRef.current);
    },
    [],
  );

  const persist = useCallback(() => {
    const current = itemsRef.current;
    const firstUser = current.find((i) => i.role === "user");
    if (!firstUser) return;
    saveChat(
      conversationIdRef.current,
      deriveTitle(firstUser.text),
      current,
      historyRef.current,
      chatScriptIdRef.current ?? undefined,
    );
  }, []);

  const model = useMemo(
    () =>
      apiKey
        ? createOpenAICompatible({
            name: "nexus",
            baseURL: NEXUS_BASE_URL,
            apiKey,
            fetch: corsSafeFetch,
          })(MODEL)
        : null,
    [apiKey],
  );
  const tools = useMemo(() => createChatTools(tag), [tag]);

  const setApiKey = useCallback((key: string) => {
    saveNexusApiKey(key);
    setApiKeyState(key);
    setError(null);
    setIsAuthError(false);
  }, []);

  const clearApiKey = useCallback(() => {
    clearNexusApiKey();
    setApiKeyState(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!model || isRunning || !text.trim()) return;

      setError(null);
      setIsAuthError(false);
      setIsRunning(true);
      stoppedRef.current = false;
      updateItems((prev) => [...prev, { role: "user", text }]);
      historyRef.current.push({ role: "user", content: text });
      // Persist now so an aborted or failed run still keeps the user message.
      persist();

      const abort = new AbortController();
      abortRef.current = abort;

      const result = streamText({
        model,
        system: systemPrompt(),
        messages: historyRef.current,
        tools,
        // Nexus reserves the full max_tokens cost upfront and rejects the
        // request with insufficient_balance when the cap exceeds the
        // account balance, so an explicit modest cap is required.
        maxOutputTokens: 16384,
        stopWhen: stepCountIs(25),
        abortSignal: abort.signal,
      });

      try {
        let started = false;
        for await (const part of result.stream) {
          if (part.type === "text-delta") {
            const delta = part.text;
            if (!started) {
              started = true;
              updateItems((prev) => [
                ...prev,
                { role: "assistant", text: delta },
              ]);
            } else {
              updateItems((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant")
                  next[next.length - 1] = {
                    role: "assistant",
                    text: last.text + delta,
                  };
                return next;
              });
            }
          } else if (part.type === "tool-call") {
            started = false;
            updateItems((prev) => [
              ...prev,
              {
                role: "tool",
                text: part.toolName,
                toolCallId: part.toolCallId,
                phase: "call",
              },
            ]);
          } else if (part.type === "tool-result") {
            updateItems((prev) => {
              const next = [...prev];
              const index = next.findIndex(
                (item) =>
                  item.role === "tool" && item.toolCallId === part.toolCallId,
              );
              const updated: ChatItem = {
                role: "tool",
                text: part.toolName,
                toolCallId: part.toolCallId,
                phase: "result",
                artifact: toolArtifact(part.output),
              };
              if (index === -1) next.push(updated);
              else next[index] = updated;
              return next;
            });
          } else if (part.type === "tool-error") {
            updateItems((prev) => {
              const next = [...prev];
              const index = next.findIndex(
                (item) =>
                  item.role === "tool" && item.toolCallId === part.toolCallId,
              );
              const updated: ChatItem = {
                role: "tool",
                text: part.toolName,
                toolCallId: part.toolCallId,
                phase: "error",
                error:
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error),
              };
              if (index === -1) next.push(updated);
              else next[index] = updated;
              return next;
            });
          } else if (part.type === "error") {
            throw part.error;
          }
        }
        // Carry the assistant and tool turns over for the next user message.
        // (result.response only covers the final step; responseMessages
        // flattens every step's assistant/tool messages.)
        historyRef.current.push(...(await result.responseMessages));
      } catch (e) {
        console.error("[chat] agent error", e);
        if (!stoppedRef.current) {
          if (APICallError.isInstance(e) && e.statusCode === 401) {
            setError("Invalid API key.");
            setIsAuthError(true);
          } else {
            setError(e instanceof Error ? e.message : String(e));
          }
        }
      } finally {
        abortRef.current = null;
        // A stop or stream error leaves tool items stuck at phase "call" —
        // persisted like that, they render as in-progress forever.
        updateItems((prev) =>
          prev.map((item) =>
            item.role === "tool" && item.phase === "call"
              ? {
                  ...item,
                  phase: "error" as const,
                  error: stoppedRef.current ? "Stopped" : "Interrupted",
                }
              : item,
          ),
        );
        setIsRunning(false);
        persist();
      }
    },
    [model, isRunning, tools, updateItems, persist],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }, []);

  const newChat = useCallback(() => {
    if (isRunning) return;
    const id = crypto.randomUUID();
    conversationIdRef.current = id;
    setConversationId(id);
    historyRef.current = [];
    itemsRef.current = [];
    setItems([]);
    setError(null);
    setIsAuthError(false);
  }, [isRunning]);

  const openChat = useCallback(
    (id: string) => {
      if (isRunning) return;
      const stored = getChat(id);
      if (!stored) return;
      conversationIdRef.current = id;
      setConversationId(id);
      historyRef.current = stored.messages;
      itemsRef.current = stored.items;
      setItems(stored.items);
      setError(null);
      setIsAuthError(false);
    },
    [isRunning],
  );

  const deleteChat = useCallback(
    (id: string) => {
      if (isRunning && id === conversationIdRef.current) return;
      removeChat(id);
      if (id === conversationIdRef.current) newChat();
    },
    [isRunning, newChat],
  );

  // Chats follow the script (script 1-N chats): creating or switching
  // scripts swaps the conversation to that script's latest chat, or a
  // fresh one for a script with no chats yet.
  useEffect(() => {
    if (!currentScriptId || isRunning) return;
    if (chatScriptIdRef.current === undefined) {
      // First resolution after mount — keep the fresh conversation, just
      // record which script owns it.
      chatScriptIdRef.current = currentScriptId;
      return;
    }
    if (chatScriptIdRef.current === currentScriptId) return;
    chatScriptIdRef.current = currentScriptId;
    const latest = listChats(currentScriptId)[0];
    if (latest && getChat(latest.id)) openChat(latest.id);
    else newChat();
  }, [currentScriptId, isRunning, openChat, newChat]);

  /** Rewind to the last user message and run it again. */
  const regenerate = useCallback(() => {
    if (isRunning) return;
    const current = itemsRef.current;
    const lastUserIdx = current.map((i) => i.role).lastIndexOf("user");
    if (lastUserIdx === -1) return;
    const text = current[lastUserIdx].text;

    const history = historyRef.current;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        historyRef.current = history.slice(0, i);
        break;
      }
    }
    const trimmed = current.slice(0, lastUserIdx);
    itemsRef.current = trimmed;
    setItems(trimmed);
    void send(text);
  }, [isRunning, send]);

  const undoRevision = useCallback(
    (revisionId: string) => {
      const result = undoScriptRevision(revisionId);
      if (result.ok) {
        updateItems((prev) =>
          prev.map((item) =>
            item.role === "tool" &&
            item.artifact?.kind === "script-change" &&
            item.artifact.revisionId === revisionId
              ? {
                  ...item,
                  artifact: { ...item.artifact, undone: true },
                }
              : item,
          ),
        );
        persist();
      }
      return result;
    },
    [persist, updateItems],
  );

  return {
    hasKey: apiKey !== null,
    setApiKey,
    clearApiKey,
    items,
    isRunning,
    error,
    isAuthError,
    send,
    stop,
    conversationId,
    newChat,
    openChat,
    deleteChat,
    regenerate,
    undoRevision,
  };
}
