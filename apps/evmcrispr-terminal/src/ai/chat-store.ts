import type { ModelMessage } from "ai";

import type { ChatItem } from "./useChatAgent";

const CHAT_INDEX_KEY = "evmcrispr:chats";
const CHAT_PREFIX = "evmcrispr:chat:";
const MAX_CHATS = 20;
const MAX_TITLE_LENGTH = 60;

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredChat {
  id: string;
  /** Render list shown in the panel. */
  items: ChatItem[];
  /** Model conversation, including tool calls and results. */
  messages: ModelMessage[];
}

function readIndex(): ChatMeta[] {
  const raw = localStorage.getItem(CHAT_INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeIndex(index: ChatMeta[]) {
  localStorage.setItem(CHAT_INDEX_KEY, JSON.stringify(index));
}

/** All stored conversations, most recently updated first. */
export function listChats(): ChatMeta[] {
  return readIndex().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getChat(id: string): StoredChat | null {
  const raw = localStorage.getItem(`${CHAT_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as StoredChat) : null;
}

export function deriveTitle(firstUserText: string): string {
  const collapsed = firstUserText.trim().replace(/\s+/g, " ");
  return collapsed.length > MAX_TITLE_LENGTH
    ? `${collapsed.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : collapsed;
}

export function saveChat(
  id: string,
  title: string,
  items: ChatItem[],
  messages: ModelMessage[],
) {
  const now = new Date().toISOString();
  const index = listChats();
  const existing = index.find((m) => m.id === id);
  if (existing) {
    existing.title = title;
    existing.updatedAt = now;
  } else {
    index.unshift({ id, title, createdAt: now, updatedAt: now });
  }

  // Prune oldest conversations beyond the cap (payloads included).
  const sorted = index.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const keep = sorted.slice(0, MAX_CHATS);
  for (const dropped of sorted.slice(MAX_CHATS)) {
    localStorage.removeItem(`${CHAT_PREFIX}${dropped.id}`);
  }

  const payload = JSON.stringify({ id, items, messages } satisfies StoredChat);
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

export function removeChat(id: string) {
  writeIndex(readIndex().filter((m) => m.id !== id));
  localStorage.removeItem(`${CHAT_PREFIX}${id}`);
}
