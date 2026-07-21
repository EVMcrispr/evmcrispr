import { useLibraryStore } from "../stores/library-store";
import type { EditLog, StoredScript } from "../types/index";

const SCRIPTS_KEY = "evmcrispr:scripts";
const EDITS_PREFIX = "evmcrispr:edits:";
const LAST_SCRIPT_KEY = "evmcrispr:lastScript";
const NEXUS_API_KEY = "evmcrispr:nexusApiKey";
const MAX_EDIT_OPS = 500;

export function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");
}

// ---------------------------------------------------------------------------
// Dappnode Nexus API key (for the AI chat panel)
// ---------------------------------------------------------------------------

export function getNexusApiKey(): string | null {
  return localStorage.getItem(NEXUS_API_KEY);
}

export function saveNexusApiKey(key: string) {
  localStorage.setItem(NEXUS_API_KEY, key);
}

export function clearNexusApiKey() {
  localStorage.removeItem(NEXUS_API_KEY);
}

// ---------------------------------------------------------------------------
// Registry CRUD
// ---------------------------------------------------------------------------

function readRegistry(): Record<string, StoredScript> {
  const raw = localStorage.getItem(SCRIPTS_KEY);
  return raw ? JSON.parse(raw) : {};
}

function writeRegistry(registry: Record<string, StoredScript>) {
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(registry));
}

export function getScript(id: string): StoredScript | undefined {
  return readRegistry()[id];
}

export function saveScript(id: string, title: string, script: string) {
  const registry = readRegistry();
  const existing = registry[id];

  if (existing && existing.title === title && existing.script === script)
    return;

  const now = new Date().toISOString();
  registry[id] = {
    id,
    title,
    script,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeRegistry(registry);
  useLibraryStore.getState().updateScript(id, { title, updatedAt: now });
}

export function removeScript(id: string) {
  const registry = readRegistry();
  delete registry[id];
  writeRegistry(registry);
  localStorage.removeItem(`${EDITS_PREFIX}${id}`);
  useLibraryStore.getState().removeScript(id);
}

export function getAllScripts(): StoredScript[] {
  const registry = readRegistry();
  return Object.values(registry).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function createScript(title = "", script = ""): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const registry = readRegistry();
  registry[id] = { id, title, script, createdAt: now, updatedAt: now };
  writeRegistry(registry);
  useLibraryStore
    .getState()
    .addScript({ id, title, createdAt: now, updatedAt: now });
  return id;
}

/**
 * Return the id of an existing pristine script (untitled, content still the
 * untouched placeholder), creating one only if none exists. Pristine
 * duplicates accumulated from previous sessions are removed, keeping the
 * most recent one.
 */
export function getOrCreatePristineScript(placeholder: string): string {
  const pristine = getAllScripts().filter(
    (s) => !s.title && s.script === placeholder,
  );
  for (const dup of pristine.slice(1)) {
    removeScript(dup.id);
  }
  return pristine[0]?.id ?? createScript("", placeholder);
}

// ---------------------------------------------------------------------------
// Per-script edit log (fine-grained undo history)
// ---------------------------------------------------------------------------

export function getEditLog(id: string): EditLog | null {
  const raw = localStorage.getItem(`${EDITS_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as EditLog) : null;
}

export function saveEditLog(id: string, log: EditLog) {
  if (log.ops.length > MAX_EDIT_OPS) {
    compactEditLog(log, Math.floor(log.ops.length / 2));
  }
  try {
    localStorage.setItem(`${EDITS_PREFIX}${id}`, JSON.stringify(log));
  } catch {
    compactEditLog(log, Math.floor(log.ops.length / 2));
    try {
      localStorage.setItem(`${EDITS_PREFIX}${id}`, JSON.stringify(log));
    } catch {
      // storage completely full — drop the edit log
      localStorage.removeItem(`${EDITS_PREFIX}${id}`);
    }
  }
}

export function clearEditLog(id: string) {
  localStorage.removeItem(`${EDITS_PREFIX}${id}`);
}

/**
 * Compact an edit log in-place: replay the first `count` ops against `base`
 * to produce a new base, then drop those ops.
 */
function compactEditLog(log: EditLog, count: number) {
  const linesToDrop = log.ops.splice(0, count);
  const lines = log.base.split("\n");

  for (const op of linesToDrop) {
    for (const edit of op.edits) {
      const [startLine, startCol, endLine, endCol] = edit.r;
      const clampedEndLine = Math.min(endLine, lines.length);
      const prefix = lines[startLine - 1]?.substring(0, startCol - 1) ?? "";
      const suffix = lines[clampedEndLine - 1]?.substring(endCol - 1) ?? "";
      const newLines = (prefix + edit.t + suffix).split("\n");
      lines.splice(startLine - 1, clampedEndLine - startLine + 1, ...newLines);
    }
  }

  log.base = lines.join("\n");
}

// ---------------------------------------------------------------------------
// Last viewed script
// ---------------------------------------------------------------------------

export function getLastViewedScript(): string | null {
  return localStorage.getItem(LAST_SCRIPT_KEY);
}

export function setLastViewedScript(id: string) {
  localStorage.setItem(LAST_SCRIPT_KEY, id);
}
