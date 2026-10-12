export type Address = `0x${string}`;

export type Author =
  | { kind: "user"; address?: Address }
  | { kind: "assistant" }
  | { kind: "agent"; address: Address; name?: string };

interface EntryBase {
  id: string;
  ts: number;
  author: Author;
  /** The entry arrived from outside this browser (an export) and nothing
   *  vouches for what it says: its author, its time, its explanation. Set
   *  by whoever takes it in, never by what is taken in. It is shown as
   *  such, and an entry recorded here takes its place when both have the
   *  same id. Signed entries (a later piece) replace this mark. */
  unverified?: true;
  /** With `unverified`, and written the same way: when this browser took
   *  the record in and how many characters it holds. What exports bring
   *  has an allowance of its own (`mergeable`), counted from these. */
  intake?: Intake;
}

export interface Intake {
  at: number;
  size: number;
}

export type RevisionSource =
  | "user"
  | "assistant"
  | "import"
  | "load"
  | "revert"
  /** An export was merged into a space that was already here. */
  | "merge";

export interface RevisionEntry extends EntryBase {
  kind: "revision";
  text: string;
  contributors?: Author[];
  origin?: { cid: string };
  parent?: string;
  summary?: string;
  source: RevisionSource;
  from?: string;
}

export interface RunEntry extends EntryBase {
  kind: "run";
  runId: string;
}

/** A revision was shared. Entries are never rewritten, so the link is an
 *  entry of its own and a row reads "shared" by looking it up. */
export interface ShareEntry extends EntryBase {
  kind: "share";
  revisionId: string;
  cid: string;
  key: string;
}

export interface SnippetEntry extends EntryBase {
  kind: "snippet";
  code: string;
  result: {
    success: boolean;
    logs: string[];
    actionCount: number;
    error?: string;
  };
}

export interface MessageEntry extends EntryBase {
  kind: "message";
  text: string;
}

export interface ClearedEntry extends EntryBase {
  kind: "cleared";
}

export type TimelineEntry =
  | RevisionEntry
  | RunEntry
  | ShareEntry
  | SnippetEntry
  | MessageEntry
  | ClearedEntry;

/** Marks an entry as removed. Its content is deleted; this stays. */
export interface Removal {
  entryId: string;
  by: Author;
  ts: number;
  /** What was removed was an unverified entry (one an export brought). It
   *  stays gone if an export brings it again, and that is all: a revision
   *  of the same id recorded here is kept, so nothing an export brings can
   *  end, by being removed, as a hole in what the user records. */
  unverified?: true;
}

export type RunStatus =
  | "running"
  | "paused"
  | "watching"
  | "success"
  | "error"
  | "cancelled"
  | "interrupted";

/** `Console` is the host's console state (the terminal stores the editor
 *  package's `ConsoleState`); this package never looks inside it. */
export interface RunRecord<Console = unknown> {
  id: string;
  revisionId: string;
  mode: "real" | "simulated";
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  by: Author;
  console: Console;
  errors: string[];
  output: string;
  executedCount: number;
  pausedBy?: "left" | "declined";
  updatedAt: number;
  /** As on an entry: the record arrived from outside this browser. */
  unverified?: true;
  intake?: Intake;
}

export const UNFINISHED: readonly RunStatus[] = [
  "running",
  "paused",
  "watching",
];

export interface SpaceMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  unreviewed: boolean;
  run?: "running" | "paused" | "watching";
}

/** One person's private marks on a space. Never synced, never exported. */
export interface Markers {
  /** The script the user signed off, as text. Reviewed means the current
   *  text equals it; see `review.ts`. */
  approvedText?: string;
  hiddenBefore?: number;
  revisionChats?: Record<string, string>;
  /** A program acting for the user has written to the script since the
   *  last revision was recorded: the next one is the program's, whatever
   *  triggers it (the turn ending, a run starting, the next visit). */
  turnPending?: boolean;
}
