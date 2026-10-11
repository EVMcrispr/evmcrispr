import type { ChatMeta, ChatStore } from "@evmcrispr/ai";
import type { Changes } from "../storage/changes";
import type { ChatPermissions, ChatRecord, Records } from "../storage/records";

/** The assistant's chats: this browser's, whatever space is on screen.
 *  They are held in memory, because the chat hook reads them synchronously,
 *  and written behind. There is no limit to how many are kept, and nothing
 *  is ever dropped to make room. */
export interface IdbChatStore extends Required<ChatStore> {
  /** Resolves once the chats have been read into memory. */
  readonly ready: Promise<void>;
  /** Resolves when everything saved so far has reached storage. */
  flushed(): Promise<void>;
  /** Reads one chat again from storage: what another tab wrote may not
   *  have been announced yet. */
  refresh(id: string): Promise<void>;
  /** What a chat has taken in and been allowed; undefined for a chat
   *  that is not kept. The same object until it changes. */
  getPermissions(id: string): ChatPermissions | undefined;
  /** Notes what a chat took in. Leaves the user's answers as they are. */
  noteTaken(id: string, taken: Pick<ChatPermissions, "read" | "web">): void;
  /** The user's answer, from their click in the chat and nowhere else. */
  grant(
    id: string,
    answer: { webWithSpaces: boolean } | { edit: string },
  ): void;
}

const NONE: ChatPermissions = { read: [], web: false, edit: [] };

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** What this tab holds with what storage holds. What a chat has taken in
 *  only grows, so a tab that knows less never clears it; an answer is
 *  the one in storage, where the tab the user clicked in wrote it. */
function merged(
  mine: ChatPermissions | undefined,
  stored: ChatPermissions | undefined,
): ChatPermissions | undefined {
  if (!mine || !stored) return stored ?? mine;
  const webWithSpaces = stored.webWithSpaces ?? mine.webWithSpaces;
  return {
    read: [...new Set([...mine.read, ...stored.read])],
    web: mine.web || stored.web,
    edit: [...new Set([...mine.edit, ...stored.edit])],
    ...(webWithSpaces === undefined ? {} : { webWithSpaces }),
  };
}

const newestFirst = (a: ChatMeta, b: ChatMeta) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

export function createIdbChatStore(deps: {
  records: Records;
  changes: Changes;
}): IdbChatStore {
  const { records, changes } = deps;
  const chats = new Map<string, ChatRecord>();
  let lastChatId: string | undefined;

  const listeners = new Set<() => void>();
  // The list as last handed out: the same array until something changes.
  let list: ChatMeta[] | undefined;
  const changed = () => {
    list = undefined;
    for (const listener of [...listeners]) listener();
  };

  const ready = (async () => {
    for (const record of await records.listChats())
      chats.set(record.id, record);
    lastChatId = await records.getPref<string>("lastChatId");
  })();

  // One write waiting per chat: a later save replaces the one waiting. A
  // write that fails is reported and the queue goes on.
  const waiting = new Map<string, ChatRecord | null>();
  let writing: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    writing = writing.then(work).catch((error) => {
      console.error("[chats] could not save", error);
    });
  };
  const write = (id: string, record: ChatRecord | null) => {
    const queued = waiting.has(id);
    waiting.set(id, record);
    if (queued) return;
    enqueue(async () => {
      const next = waiting.get(id);
      waiting.delete(id);
      await (next ? records.putChat(next) : records.deleteChat(id));
      changes.announce({ store: "chats", key: id });
    });
  };

  const refresh = async (id: string) => {
    // What this tab has yet to write is newer than what storage holds.
    if (waiting.has(id)) return;
    const stored = await records.getChat(id);
    const mine = chats.get(id);
    if (waiting.has(id)) return;
    if (!stored || !mine) {
      if (!stored && !mine) return;
      if (stored) chats.set(id, stored);
      else chats.delete(id);
      return changed();
    }
    // The chat and what goes with it change apart: an answer given in
    // another tab arrives with the same chat, and leaves ours as it is.
    const sameChat = stored.meta.updatedAt === mine.meta.updatedAt;
    const permissions = merged(mine.permissions, stored.permissions);
    if (sameChat && same(permissions, mine.permissions)) return;
    chats.set(id, {
      ...(sameChat ? mine : stored),
      ...(permissions ? { permissions } : {}),
    });
    changed();
  };
  changes.subscribe((change, local) => {
    if (!local && change.store === "chats") void refresh(change.key);
  });

  // The chat itself stays the same object: only what goes with it changes.
  const permissions = (
    id: string,
    change: (now: ChatPermissions) => ChatPermissions,
  ) => {
    const record = chats.get(id);
    if (!record) return;
    const next = { ...record, permissions: change(record.permissions ?? NONE) };
    chats.set(id, next);
    write(id, next);
    changed();
  };

  return {
    ready,
    flushed: () => writing,
    refresh,
    listChats(scopeId) {
      list ??= [...chats.values()].map((c) => c.meta).sort(newestFirst);
      return scopeId ? list.filter((m) => m.scopeId === scopeId) : list;
    },
    getChat: (id) => chats.get(id)?.chat ?? null,
    saveChat(id, title, items, messages, scopeId) {
      const now = new Date().toISOString();
      const existing = chats.get(id)?.meta;
      const meta: ChatMeta = {
        id,
        title,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      // A label, set once: the space the chat started in.
      const label = existing ? existing.scopeId : scopeId;
      if (label) meta.scopeId = label;
      const permissions = chats.get(id)?.permissions;
      const record: ChatRecord = {
        id,
        meta,
        chat: { id, items, messages },
        ...(permissions ? { permissions } : {}),
      };
      chats.set(id, record);
      write(id, record);
      changed();
    },
    removeChat(id) {
      if (!chats.delete(id)) return;
      write(id, null);
      changed();
    },
    getPermissions: (id) =>
      chats.has(id) ? (chats.get(id)?.permissions ?? NONE) : undefined,
    noteTaken(id, { read, web }) {
      permissions(id, (now) => ({ ...now, read, web }));
    },
    grant(id, answer) {
      permissions(id, (now) =>
        "edit" in answer
          ? { ...now, edit: [...new Set([...now.edit, answer.edit])] }
          : { ...now, webWithSpaces: answer.webWithSpaces },
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLastChatId: () => lastChatId,
    setLastChatId(id) {
      if (id === lastChatId) return;
      lastChatId = id;
      enqueue(() => records.setPref("lastChatId", id));
    },
  };
}
