import type { ModelMessage } from "ai";

import type { ChatItem } from "./types";

const MAX_CHATS = 20;
const MAX_TITLE_LENGTH = 60;

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Owning scope (e.g. a script id) — a scope has N chats. Absent on chats
   *  saved before the hierarchy existed, or hosts with a single scope; they
   *  show under every scope until re-saved. */
  scopeId?: string;
}

export interface StoredChat {
  id: string;
  /** Render list shown in the panel. */
  items: ChatItem[];
  /** Model conversation, including tool calls and results. */
  messages: ModelMessage[];
}

/** Chat conversation persistence keyed by a host-namespace prefix, so
 *  multiple hosts on one origin (or one host with several chat surfaces)
 *  don't collide in `localStorage`. */
export function createChatStore(namespace = "evmcrispr") {
  const INDEX_KEY = `${namespace}:chats`;
  const CHAT_PREFIX = `${namespace}:chat:`;

  function readIndex(): ChatMeta[] {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function writeIndex(index: ChatMeta[]) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  /** Stored conversations, most recently updated first. With a scopeId,
   *  only that scope's chats (plus legacy untagged ones). */
  function listChats(scopeId?: string): ChatMeta[] {
    const all = readIndex().sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return scopeId
      ? all.filter((m) => m.scopeId == null || m.scopeId === scopeId)
      : all;
  }

  function getChat(id: string): StoredChat | null {
    const raw = localStorage.getItem(`${CHAT_PREFIX}${id}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredChat>;
      if (
        typeof parsed.id !== "string" ||
        !Array.isArray(parsed.items) ||
        !Array.isArray(parsed.messages)
      ) {
        return null;
      }
      return {
        id: parsed.id,
        items: parsed.items,
        messages: parsed.messages,
      };
    } catch {
      return null;
    }
  }

  function saveChat(
    id: string,
    title: string,
    items: ChatItem[],
    messages: ModelMessage[],
    scopeId?: string,
  ) {
    const now = new Date().toISOString();
    const index = listChats();
    const existing = index.find((m) => m.id === id);
    if (existing) {
      existing.title = title;
      existing.updatedAt = now;
      // Adopt legacy chats into the scope they are continued under.
      if (scopeId) existing.scopeId = scopeId;
    } else {
      index.unshift({ id, title, createdAt: now, updatedAt: now, scopeId });
    }

    // Prune oldest conversations beyond the cap (payloads included).
    const sorted = index.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const keep = sorted.slice(0, MAX_CHATS);
    for (const dropped of sorted.slice(MAX_CHATS)) {
      localStorage.removeItem(`${CHAT_PREFIX}${dropped.id}`);
    }

    const payload = JSON.stringify({
      id,
      items,
      messages,
    } satisfies StoredChat);
    try {
      writeIndex(keep);
      localStorage.setItem(`${CHAT_PREFIX}${id}`, payload);
    } catch {
      // Quota exceeded — drop the other stored conversations and retry once.
      for (const meta of keep) {
        if (meta.id !== id) localStorage.removeItem(`${CHAT_PREFIX}${meta.id}`);
      }
      try {
        writeIndex(keep.filter((m) => m.id === id));
        localStorage.setItem(`${CHAT_PREFIX}${id}`, payload);
      } catch {
        // storage completely full — skip persisting this conversation
        localStorage.removeItem(`${CHAT_PREFIX}${id}`);
      }
    }
  }

  function removeChat(id: string) {
    writeIndex(readIndex().filter((m) => m.id !== id));
    localStorage.removeItem(`${CHAT_PREFIX}${id}`);
  }

  return { listChats, getChat, saveChat, removeChat };
}

export function deriveTitle(firstUserText: string): string {
  const collapsed = firstUserText.trim().replace(/\s+/g, " ");
  return collapsed.length > MAX_TITLE_LENGTH
    ? `${collapsed.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : collapsed;
}

const defaultStore = createChatStore();

export const listChats = defaultStore.listChats;
export const getChat = defaultStore.getChat;
export const saveChat = defaultStore.saveChat;
export const removeChat = defaultStore.removeChat;
