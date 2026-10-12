import type { ChatMeta } from "@evmcrispr/ai";
import { useMemo, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";

export interface ListedChat extends ChatMeta {
  /** The title of the space the chat started in, while that space is
   *  still here. A chat belongs to the browser, not to it. */
  startedIn?: string;
}

/** Every chat of this browser, most recent first. */
export function useChatList(): ListedChat[] {
  const { chats, spaces } = useApp();
  const list = useSyncExternalStore(chats.subscribe, () => chats.listChats());
  const index = useStore(spaces.index);
  return useMemo(() => {
    const titles = new Map(index.map((meta) => [meta.id, meta.title]));
    return list.map((chat) => ({
      ...chat,
      startedIn: chat.scopeId ? titles.get(chat.scopeId) : undefined,
    }));
  }, [list, index]);
}

export function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** When a chat was last used, and where it started. */
export const chatByline = (chat: ListedChat) =>
  chat.startedIn
    ? `${relativeDate(chat.updatedAt)} · started in ${chat.startedIn}`
    : relativeDate(chat.updatedAt);
