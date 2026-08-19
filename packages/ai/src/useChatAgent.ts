import { type ModelMessage, stepCountIs, streamText, type ToolSet } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type ChatErrorInfo, classifyChatError } from "./chat-errors";
import { createChatStore, deriveTitle } from "./chat-store";
import type { NexusConfig } from "./config";
import { createNexusModel } from "./nexus-client";
import { nowStamp } from "./prompt";
import { type ChatStorage, createLocalStorageChatStorage } from "./storage";
import type { ScriptEditResult } from "./tools/script-tools";
import type { ChatItem, ChatToolArtifact } from "./types";

export interface UseChatAgentOptions {
  /** System prompt. Pass a function to have it re-evaluated per run (e.g.
   *  `() => withClock(PROMPT)` so the embedded clock doesn't drift). */
  systemPrompt: string | (() => string);
  /** Tools available to the model (compose the factories from this package
   *  with host-specific ones). */
  tools: ToolSet;
  /** Conversation scope (e.g. the current script id). Chats persist under
   *  it, and changing scope swaps to that scope's latest chat (or a fresh
   *  one). Omit for hosts with a single chat surface. */
  scopeId?: string | null;
  /** Undo a script revision recorded by the host's edit tools. Without it,
   *  `undoRevision` reports that undo is unsupported. */
  undoScriptRevision?: (revisionId: string) => ScriptEditResult;
  /** API key persistence; defaults to namespaced `localStorage`. */
  storage?: ChatStorage;
  /** Conversation persistence; defaults to namespaced `localStorage`. */
  chatStore?: ReturnType<typeof createChatStore>;
  nexusConfig?: Partial<NexusConfig>;
  /** Appended to the last user turn each run so a long chat keeps a fresh
   *  clock. Defaults to `nowStamp()`; return "" to disable. */
  turnStamp?: () => string;
  /** Nexus reserves the full max_tokens cost upfront and rejects the request
   *  with insufficient_balance when the cap exceeds the account balance, so
   *  an explicit modest cap is required. */
  maxOutputTokens?: number;
  maxSteps?: number;
}

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

/**
 * Headless chat agent: streams a tool-using conversation against DappNode
 * Nexus and exposes render-ready state. Hosts own the UI entirely; this hook
 * owns the model client, the agent loop, API-key state and persistence.
 */
export function useChatAgent(options: UseChatAgentOptions) {
  const {
    systemPrompt,
    tools,
    scopeId,
    undoScriptRevision,
    nexusConfig,
    turnStamp = nowStamp,
    maxOutputTokens = 16384,
    maxSteps = 25,
  } = options;

  // Persistence backends are captured once: swapping storage mid-session
  // isn't a supported use case and would orphan the conversation.
  const storageRef = useRef<ChatStorage | undefined>(undefined);
  storageRef.current ??= options.storage ?? createLocalStorageChatStorage();
  const storage = storageRef.current;
  const chatStoreRef = useRef<ReturnType<typeof createChatStore> | undefined>(
    undefined,
  );
  chatStoreRef.current ??= options.chatStore ?? createChatStore();
  const chats = chatStoreRef.current;

  const [apiKey, setApiKeyState] = useState<string | null>(() =>
    storage.getApiKey(),
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // One piece of state, so the copy shown to the user and the kind of failure
  // it describes can never disagree — or outlive one another.
  const [error, setError] = useState<ChatErrorInfo | null>(null);
  // Each page load starts a fresh conversation; old ones live in the history.
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );

  const historyRef = useRef<ModelMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  // A chat belongs to the scope it was started under (scope 1-N chats).
  // Captured here rather than read live so a run that outlasts a scope
  // switch still persists under its own scope.
  const chatScopeIdRef = useRef<string | null | undefined>(undefined);
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
    chats.saveChat(
      conversationIdRef.current,
      deriveTitle(firstUser.text),
      current,
      historyRef.current,
      chatScopeIdRef.current ?? undefined,
    );
  }, [chats]);

  const model = useMemo(
    () => createNexusModel(apiKey, nexusConfig),
    [apiKey, nexusConfig],
  );

  const setApiKey = useCallback(
    (key: string) => {
      storage.saveApiKey(key);
      setApiKeyState(key);
      setError(null);
    },
    [storage],
  );

  const clearApiKey = useCallback(() => {
    storage.clearApiKey();
    setApiKeyState(null);
    // Symmetrical with setApiKey: without this the last run's banner would
    // outlive the key it complained about.
    setError(null);
  }, [storage]);

  const send = useCallback(
    async (text: string) => {
      if (!model || isRunning || !text.trim()) return;

      setError(null);
      setIsRunning(true);
      stoppedRef.current = false;
      updateItems((prev) => [...prev, { role: "user", text }]);
      historyRef.current.push({ role: "user", content: text });
      // Persist now so an aborted or failed run still keeps the user message.
      persist();

      const abort = new AbortController();
      abortRef.current = abort;

      // The clock (or any host stamp) is restated on the last user turn: in
      // a long chat the system prompt sits thousands of tokens back and the
      // model stops applying it. It rides along with the user message
      // because the provider rejects system messages inside `messages`, and
      // is kept out of the persisted history so old turns don't accumulate
      // stale stamps.
      const stamp = turnStamp();
      const result = streamText({
        model,
        system:
          typeof systemPrompt === "function" ? systemPrompt() : systemPrompt,
        messages: [
          ...historyRef.current.slice(0, -1),
          {
            role: "user",
            content: stamp ? `${text}\n\n${stamp}` : text,
          },
        ],
        tools,
        maxOutputTokens,
        stopWhen: stepCountIs(maxSteps),
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
          const { kind, message } = classifyChatError(e);
          setError({ kind, message });
          // A dead key can only be replaced, so drop it: `hasKey` goes false
          // and the host's settings screen offers a fresh login instead of a
          // Disconnect button the user has no reason to press. The OAuth
          // session stays — `loginWithNexus()` revokes and re-provisions
          // from it. An empty balance is *not* an auth failure: logging in
          // again would burn a working key and buy no credit.
          if (kind === "auth") {
            storage.clearApiKey();
            setApiKeyState(null);
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
    [
      model,
      isRunning,
      tools,
      systemPrompt,
      turnStamp,
      maxOutputTokens,
      maxSteps,
      updateItems,
      persist,
      storage,
    ],
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
  }, [isRunning]);

  const openChat = useCallback(
    (id: string) => {
      if (isRunning) return;
      const stored = chats.getChat(id);
      if (!stored) return;
      conversationIdRef.current = id;
      setConversationId(id);
      historyRef.current = stored.messages;
      itemsRef.current = stored.items;
      setItems(stored.items);
      setError(null);
    },
    [isRunning, chats],
  );

  const deleteChat = useCallback(
    (id: string) => {
      if (isRunning && id === conversationIdRef.current) return;
      chats.removeChat(id);
      if (id === conversationIdRef.current) newChat();
    },
    [isRunning, newChat, chats],
  );

  // Chats follow the scope (scope 1-N chats): creating or switching scopes
  // swaps the conversation to that scope's latest chat, or a fresh one for
  // a scope with no chats yet.
  useEffect(() => {
    if (!scopeId || isRunning) return;
    if (chatScopeIdRef.current === undefined) {
      // First resolution after mount — keep the fresh conversation, just
      // record which scope owns it.
      chatScopeIdRef.current = scopeId;
      return;
    }
    if (chatScopeIdRef.current === scopeId) return;
    chatScopeIdRef.current = scopeId;
    const latest = chats.listChats(scopeId)[0];
    if (latest && chats.getChat(latest.id)) openChat(latest.id);
    else newChat();
  }, [scopeId, isRunning, openChat, newChat, chats]);

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
    (revisionId: string): ScriptEditResult => {
      if (!undoScriptRevision)
        return { ok: false, error: "Undo is not supported here." };
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
    [persist, updateItems, undoScriptRevision],
  );

  return {
    hasKey: apiKey !== null,
    setApiKey,
    clearApiKey,
    items,
    isRunning,
    error,
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
