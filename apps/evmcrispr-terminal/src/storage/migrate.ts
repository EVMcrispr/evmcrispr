import { textHash, withTitle } from "@evmcrispr/space";
import type { Spaces } from "../space/spaces";
import { type Locks, lockNames } from "./locks";
import type { ChatRecord, Records } from "./records";

const DONE = "evmcrispr:migrated:spaces";
const SCRIPTS = "evmcrispr:scripts";
/** Set by the pre-UUID migration this one replaces. */
const UUIDS_DONE = "evmcrispr:migrated";

/** What an untouched script held before this release. Such a script was
 *  never the user's; migrating it would list a space named after the
 *  example in it. */
const OLD_PLACEHOLDER = `## Example: deposit 1 ETH into WETH

# switch mainnet
# exec @token(WETH) deposit() --value 1e18
`;

const isPlaceholder = (stored: { title: string; script: string }) =>
  !stored.title && stored.script === OLD_PLACEHOLDER;

/** A script as `evmcrispr:scripts` stored it. */
interface StoredScript {
  id: string;
  title: string;
  script: string;
  createdAt: string;
  updatedAt: string;
}

function isStored(x: unknown): x is StoredScript {
  const s = x as StoredScript | null;
  return (
    !!s &&
    typeof s.id === "string" &&
    typeof s.script === "string" &&
    typeof s.title === "string" &&
    !Number.isNaN(Date.parse(s.createdAt)) &&
    !Number.isNaN(Date.parse(s.updatedAt))
  );
}

/** Old storage is read as it comes: anything may be missing or malformed. */
type Loose = Record<string, unknown> | undefined;

function parse(raw: string | null): Loose {
  try {
    const value: unknown = raw ? JSON.parse(raw) : undefined;
    return value && typeof value === "object" ? (value as Loose) : undefined;
  } catch {
    return undefined;
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Scripts from before ids existed (`savedScripts`, and the script the
 *  zustand-persisted `terminal-store` held), for a browser that never ran
 *  the migration to `evmcrispr:scripts`. They get an id made from what
 *  they hold, so migrating one twice is migrating it once. */
function preUuidScripts(local: Pick<Storage, "getItem">): StoredScript[] {
  if (local.getItem(UUIDS_DONE)) return [];
  const persisted = parse(local.getItem("terminal-store"));
  const epoch = new Date(0).toISOString();
  return [
    ...Object.values(parse(local.getItem("savedScripts")) ?? {}),
    persisted?.state ?? persisted,
  ]
    .map((entry) => {
      const { title, script } = (entry ?? {}) as Record<string, unknown>;
      return { title: text(title), script: text(script) };
    })
    .filter((entry) => entry.title || entry.script.trim())
    .map((entry) => ({
      ...entry,
      id: `pre-${textHash(JSON.stringify([entry.title, entry.script])).slice(0, 32)}`,
      createdAt: epoch,
      updatedAt: epoch,
    }));
}

/**
 * Turns the scripts kept in localStorage into spaces. Runs before the first
 * space opens, in one tab at a time. Idempotent per script; a script that
 * fails is left for the next load and the flag is set only when none did,
 * and only when what was made will still be there (`persistent`): in a
 * browser that refused storage this time the scripts are usable for the
 * session and migrated for good on a later load.
 * Reads the old keys and never writes or deletes them.
 */
export async function migrate(deps: {
  spaces: Spaces;
  records: Records;
  locks: Locks;
  local: Pick<Storage, "getItem" | "setItem">;
  persistent: boolean;
}): Promise<void> {
  const { spaces, records, locks, local, persistent } = deps;
  if (local.getItem(DONE)) return;
  const release = await locks.hold(lockNames.migrate);
  try {
    if (local.getItem(DONE)) return;
    let failed = false;

    for (const stored of [
      ...Object.values(parse(local.getItem(SCRIPTS)) ?? {}),
      ...preUuidScripts(local),
    ]) {
      try {
        if (!isStored(stored)) throw new Error("not a stored script");
        if (isPlaceholder(stored)) continue;
        // Migrated when it has its first revision: an index record alone
        // is what an interrupted attempt leaves, and is made again.
        if ((await records.loadTimeline(stored.id)).entries.length) continue;
        const fromBeforeIds = Date.parse(stored.createdAt) === 0;
        await spaces.create(
          {
            text: withTitle(stored.title, stored.script),
            source: "import",
            ...(fromBeforeIds
              ? {}
              : {
                  createdAt: Date.parse(stored.createdAt),
                  ts: Date.parse(stored.updatedAt),
                }),
          },
          stored.id,
        );
      } catch {
        failed = true;
      }
    }

    if (!failed && persistent) local.setItem(DONE, "1");
  } finally {
    release();
  }
}

const CHATS_DONE = "evmcrispr:migrated:chats";
const CHATS = "evmcrispr:chats";

/** A chat as `createChatStore()` of @evmcrispr/ai kept it: a line of the
 *  index under `evmcrispr:chats` and its content under its own key. */
function storedChat(
  local: Pick<Storage, "getItem">,
  meta: unknown,
): ChatRecord | undefined {
  const { id, title, createdAt, updatedAt } = (meta ?? {}) as Record<
    string,
    unknown
  >;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  )
    return undefined;
  const chat = parse(local.getItem(`evmcrispr:chat:${id}`));
  if (!chat || !Array.isArray(chat.items) || !Array.isArray(chat.messages))
    return undefined;
  return {
    id,
    meta: meta as ChatRecord["meta"],
    chat: { id, items: chat.items, messages: chat.messages },
  };
}

/**
 * Copies the assistant chats kept in localStorage into the `chats` store,
 * unchanged. A chat's `scopeId`, where it has one, already names the space
 * it started in; one without is kept without a label. A chat already in
 * the store is left as it is there. One that cannot be read is skipped and
 * the flag waits, as it does in a browser that refused storage this time.
 * Reads the old keys and never writes or deletes them.
 */
export async function migrateChats(deps: {
  records: Records;
  locks: Locks;
  local: Pick<Storage, "getItem" | "setItem">;
  persistent: boolean;
}): Promise<void> {
  const { records, locks, local, persistent } = deps;
  if (local.getItem(CHATS_DONE)) return;
  const release = await locks.hold(lockNames.migrate);
  try {
    if (local.getItem(CHATS_DONE)) return;
    let index: unknown;
    try {
      index = JSON.parse(local.getItem(CHATS) ?? "[]");
    } catch {
      index = undefined;
    }
    let failed = !Array.isArray(index);
    const known = new Set((await records.listChats()).map((chat) => chat.id));
    for (const meta of Array.isArray(index) ? index : []) {
      try {
        const record = storedChat(local, meta);
        if (!record) throw new Error("not a stored chat");
        if (!known.has(record.id)) await records.putChat(record);
      } catch {
        failed = true;
      }
    }
    if (!failed && persistent) local.setItem(CHATS_DONE, "1");
  } finally {
    release();
  }
}
