import { type ModelMessage, stepCountIs, streamText, type ToolSet } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BUSY_ERROR_MESSAGE,
  type ChatErrorInfo,
  classifyChatError,
} from "./chat-errors";
import {
  type ChatStore,
  createChatStore,
  deriveTitle,
  type StoredChat,
} from "./chat-store";
import type { NexusConfig } from "./config";
import { createNexusModel } from "./nexus-client";
import { nowStamp } from "./prompt";
import { type ChatStorage, createLocalStorageChatStorage } from "./storage";
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
  /** The chat to start on: an id, or "latest" for the one that was open
   *  last (else the most recent). Without it, or when there is none, a
   *  fresh conversation. */
  initialChatId?: string;
  /** API key persistence; defaults to namespaced `localStorage`. */
  storage?: ChatStorage;
  /** Conversation persistence; defaults to namespaced `localStorage`. */
  chatStore?: ChatStore;
  nexusConfig?: Partial<NexusConfig>;
  /** Appended to the last user turn each run so a long chat keeps a fresh
   *  clock. Defaults to `nowStamp()`; return "" to disable. */
  turnStamp?: () => string;
  /** Nexus reserves the full max_tokens cost upfront and rejects the request
   *  with insufficient_balance when the cap exceeds the account balance, so
   *  an explicit modest cap is required. */
  maxOutputTokens?: number;
  maxSteps?: number;
  /** Takes the right to answer in a chat, for hosts where the same chat
   *  can be open twice (two tabs). Resolves to what gives it back, or to
   *  null when someone else is answering: nothing is sent then, and the
   *  error is of kind `busy`. A host with a `subscribe`-able store brings
   *  the chat up to date before resolving. */
  acquireTurn?: (chatId: string) => Promise<(() => void) | null>;
  /** A turn began: the user's message is in, the model has not answered.
   *  `scope` is what `send` was given. */
  onTurnStart?: (turn: ChatTurn) => void;
  /** The turn is over: answered, stopped or failed. Always follows its
   *  `onTurnStart`, once. */
  onTurnEnd?: (turn: ChatTurn & { stopped: boolean }) => void;
}

export interface ChatTurn {
  id: string;
  chatId: string;
  /** Where the user was when they sent the message (for the terminal, the
   *  space on screen). The host's tools act there. */
  scope?: string;
}

/** What `send` takes besides the text. */
export interface SendContext {
  /** Handed to the turn callbacks; labels the chat when it starts one. */
  scope?: string;
}

/** A simulation's output can be long; a chat keeps the end of it. */
const MAX_LOG_LINES = 200;

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

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
      explanation: optionalString(value.explanation),
      space: optionalString(value.space),
      error: optionalString(value.error),
    };
  }

  if (value.kind === "permission") {
    if (value.what === "web") return { kind: "permission", what: "web" };
    return value.what === "edit" && typeof value.space === "string"
      ? { kind: "permission", what: "edit", space: value.space }
      : undefined;
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
          (item?.type === "smartBatch" &&
          Array.isArray(record(item.plan)?.steps)
            ? (record(item.plan)!.steps as unknown[]).length
            : item?.type === "batched" && Array.isArray(item.actions)
              ? item.actions.length
              : 1)
        );
      }, 0),
      error: optionalString(value.error),
      target:
        value.target === "script" || value.target === "snippet"
          ? value.target
          : undefined,
      code: optionalString(value.code),
      logs: Array.isArray(value.logs)
        ? value.logs.slice(-MAX_LOG_LINES).map(String)
        : undefined,
      revisionId: optionalString(value.revisionId),
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
    acquireTurn,
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
  const chatStoreRef = useRef<ChatStore | undefined>(undefined);
  chatStoreRef.current ??= options.chatStore ?? createChatStore();
  const chats = chatStoreRef.current;
  // The chat the page opens on, resolved once.
  const initialRef = useRef<{ id: string; chat: StoredChat | null }>(undefined);
  initialRef.current ??= (() => {
    const wanted =
      options.initialChatId === "latest"
        ? [chats.getLastChatId?.(), chats.listChats()[0]?.id]
        : [options.initialChatId];
    for (const id of wanted) {
      const chat = id ? chats.getChat(id) : null;
      if (id && chat) return { id, chat };
    }
    return { id: crypto.randomUUID(), chat: null };
  })();
  const initial = initialRef.current;

  const [apiKey, setApiKeyState] = useState<string | null>(() =>
    storage.getApiKey(),
  );
  const [items, setItems] = useState<ChatItem[]>(initial.chat?.items ?? []);
  const [isRunning, setIsRunning] = useState(false);
  // One piece of state, so the copy shown to the user and the kind of failure
  // it describes can never disagree — or outlive one another.
  const [error, setError] = useState<ChatErrorInfo | null>(null);
  const [conversationId, setConversationId] = useState<string>(initial.id);

  const historyRef = useRef<ModelMessage[]>(initial.chat?.messages ?? []);
  // The chat as the store last gave it to, or took it from, this hook. A
  // different object there means it changed under us (another tab).
  const syncedRef = useRef<StoredChat | null>(initial.chat);
  // True from the moment a message is accepted until its turn is over,
  // the wait for `acquireTurn` included (`isRunning` follows a render later).
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  // Read through refs so a host passing fresh closures every render does
  // not rebuild `send`.
  const onTurnStartRef = useRef(options.onTurnStart);
  onTurnStartRef.current = options.onTurnStart;
  const onTurnEndRef = useRef(options.onTurnEnd);
  onTurnEndRef.current = options.onTurnEnd;
  // A chat belongs to the scope it was started under (scope 1-N chats).
  // Captured here rather than read live so a run that outlasts a scope
  // switch still persists under its own scope.
  const chatScopeIdRef = useRef<string | null | undefined>(undefined);
  // Abort any in-flight run on unmount — an orphaned stream would keep
  // executing script-editing tools with no visible chat or Stop button.
  useEffect(() => () => abortRef.current?.abort(), []);
  // Mirrors `items` so async persistence sees the latest render list.
  const itemsRef = useRef<ChatItem[]>(initial.chat?.items ?? []);
  const conversationIdRef = useRef(conversationId);

  /** Shows another conversation: a stored one, or a fresh one. */
  const show = useCallback((id: string, chat: StoredChat | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
    syncedRef.current = chat;
    historyRef.current = chat?.messages ?? [];
    itemsRef.current = chat?.items ?? [];
    setItems(itemsRef.current);
    setError(null);
  }, []);

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

  const persist = useCallback(
    (label?: string) => {
      const current = itemsRef.current;
      const firstUser = current.find((i) => i.role === "user");
      if (!firstUser) return;
      const id = conversationIdRef.current;
      chats.saveChat(
        id,
        deriveTitle(firstUser.text),
        current,
        historyRef.current,
        chatScopeIdRef.current ?? label,
      );
      syncedRef.current = chats.getChat(id);
      chats.setLastChatId?.(id);
    },
    [chats],
  );

  /** Takes the open chat from a store that can change under the hook, if
   *  it did: saved in another tab, or removed there. */
  const follow = useCallback(() => {
    if (!chats.subscribe) return;
    const id = conversationIdRef.current;
    const stored = chats.getChat(id);
    if (stored === syncedRef.current) return;
    // Removed elsewhere: what is on screen is no longer a kept chat.
    show(stored ? id : crypto.randomUUID(), stored);
  }, [chats, show]);
  useEffect(
    () =>
      chats.subscribe?.(() => {
        if (!sendingRef.current) follow();
      }),
    [chats, follow],
  );

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
    async (text: string, context: SendContext = {}) => {
      if (!model || sendingRef.current || !text.trim()) return;
      sendingRef.current = true;
      setError(null);

      // One turn at a time per chat, wherever it is open. Nothing is
      // shown, saved or sent before the right to answer is held.
      const chatId = conversationIdRef.current;
      const release = acquireTurn
        ? await acquireTurn(chatId).catch(() => null)
        : () => {};
      // What another tab answered meanwhile comes first. A chat removed
      // there is not answered under the right taken for it.
      if (release) follow();
      if (!release || chatId !== conversationIdRef.current) {
        release?.();
        sendingRef.current = false;
        if (!release) setError({ kind: "busy", message: BUSY_ERROR_MESSAGE });
        return;
      }

      setIsRunning(true);
      stoppedRef.current = false;
      // A chat is labelled with where it started.
      const label = itemsRef.current.length ? undefined : context.scope;
      updateItems((prev) => [...prev, { role: "user", text }]);
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: text },
      ];
      // Persist now so an aborted or failed run still keeps the user message.
      persist(label);
      const turn: ChatTurn = {
        id: crypto.randomUUID(),
        chatId: conversationIdRef.current,
        scope: context.scope,
      };
      onTurnStartRef.current?.(turn);

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
        historyRef.current = [
          ...historyRef.current,
          ...(await result.responseMessages),
        ];
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
        onTurnEndRef.current?.({ ...turn, stopped: stoppedRef.current });
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
        persist(label);
        sendingRef.current = false;
        release();
      }
    },
    [
      model,
      acquireTurn,
      follow,
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
    if (sendingRef.current) return;
    show(crypto.randomUUID(), null);
  }, [show]);

  const openChat = useCallback(
    (id: string) => {
      if (sendingRef.current) return;
      const stored = chats.getChat(id);
      if (!stored) return;
      show(id, stored);
      chats.setLastChatId?.(id);
    },
    [chats, show],
  );

  const deleteChat = useCallback(
    (id: string) => {
      const open = id === conversationIdRef.current;
      if (sendingRef.current && open) return;
      chats.removeChat(id);
      if (open) show(crypto.randomUUID(), null);
    },
    [chats, show],
  );

  // Chats follow the scope (scope 1-N chats): creating or switching scopes
  // swaps the conversation to that scope's latest chat, or a fresh one for
  // a scope with no chats yet.
  // (A host whose chats are not tied to a scope passes none, and labels a
  // chat through `send`'s context instead.)
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
  const regenerate = useCallback(
    (context?: SendContext) => {
      if (sendingRef.current) return;
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
      void send(text, context);
    },
    [send],
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
  };
}
