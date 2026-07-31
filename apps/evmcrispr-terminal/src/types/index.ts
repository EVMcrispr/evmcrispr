export type BareScript = {
  title: string;
  script: string;
};

export type ScriptMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredScript = ScriptMeta & {
  script: string;
};

/** Shape used in the old slug-keyed `savedScripts` localStorage key. */
export type LegacyStoredScript = {
  title: string;
  date: string;
  script: string;
};

// ---------------------------------------------------------------------------
// Edit-log types (per-script undo history persisted to localStorage)
// ---------------------------------------------------------------------------

export type StoredEdit = {
  r: [number, number, number, number]; // [startLine, startCol, endLine, endCol]
  t: string; // replacement text
};

export type EditOp = {
  edits: StoredEdit[];
  ts: number; // Date.now() when the change happened
  source?: "user" | "ai-chat";
  revisionId?: string;
  revisionBefore?: string;
  revisionAfter?: string;
};

export type EditLog = {
  base: string; // document content at start of log
  ops: EditOp[]; // ordered edit operations
};
