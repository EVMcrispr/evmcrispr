// The built-in assistant's hands. What the model asks for arrives here as
// tool calls, and everything in them is data: a space id is looked up
// among the user's own spaces and never made, an edit is handed to the
// space as data (`LiveSpace.editAsTurn`) and recorded as the assistant's,
// and the only way to run code is `simulate`, which has no wallet.
// The assistant is a foreign writer: the review marker does not follow
// what it writes, and nothing here reaches the editor.
import {
  type ChatTurn,
  MAX_EXPLANATION,
  plainLine,
  type ScriptEditRequest,
  type ScriptEditResult,
  type ScriptToolsHost,
} from "@evmcrispr/ai";
import type { EvmlTag, SimulationResult } from "@evmcrispr/core";
import {
  head,
  lineStats,
  orderedEntries,
  type TimelineEntry,
  type TimelineState,
} from "@evmcrispr/space";
import type { LiveSpace, ScriptEdit } from "../space/live-space";
import type { Spaces } from "../space/spaces";

export interface AssistantHost {
  tools: ScriptToolsHost;
  /** The turn being answered. */
  turn(): ChatTurn | null;
  /** A turn began, for a message sent from the space `turn.scope`. */
  beginTurn(turn: ChatTurn): void;
  /** The turn ended: every space it edited gets its revision. */
  endTurn(turnId: string): void;
}

interface Turn extends ChatTurn {
  /** The spaces this turn edited, held until it ends, each with what the
   *  model said of its edits there. */
  edited: Map<string, { space: LiveSpace; explanations: string[] }>;
}

/** The longest summary a turn's revision carries. */
const MAX_SUMMARY = 3 * MAX_EXPLANATION;

/** How much of a timeline `read_space` hands to the model. */
const RECENT = 20;

const WHO = { user: "the user", assistant: "the assistant", agent: "an agent" };
const VERB: Partial<Record<string, string>> = {
  import: "opened the script",
  load: "loaded a revision",
  revert: "reverted a change",
};

/** One entry as a line for the model: who, when, how much changed, how a
 *  run stands. Only what the model needs to work, built field by field: a
 *  share's link and key, the private marks and the chats never enter. An
 *  explanation is a program's words kept in the record, so it is handed
 *  over quoted, as the untrusted field it is. */
function line(entry: TimelineEntry, state: TimelineState): string | null {
  const when = `${new Date(entry.ts).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  switch (entry.kind) {
    case "revision": {
      const parent = entry.parent ? state.entries.get(entry.parent) : undefined;
      // A first revision adds what it holds.
      const { added, removed } =
        parent?.kind === "revision"
          ? lineStats(parent.text, entry.text)
          : { added: entry.text.split("\n").length, removed: 0 };
      const what = `${when} revision by ${WHO[entry.author.kind]} (+${added} -${removed} lines): `;
      return entry.summary === undefined
        ? what + (VERB[entry.source] ?? "edited the script")
        : `${what}explanation (untrusted) ${JSON.stringify(plainLine(entry.summary))}`;
    }
    case "run": {
      const run = state.runs.get(entry.runId);
      return run
        ? `${when} ${run.mode === "simulated" ? "simulation" : "run"}: ${run.status}`
        : null;
    }
    case "share":
      return `${when} a revision was shared`;
    case "cleared":
      return `${when} the timeline was cleared`;
    default:
      return null;
  }
}

const recent = (state: TimelineState) =>
  orderedEntries(state)
    .map((entry) => line(entry, state))
    .filter((text) => text !== null)
    .slice(-RECENT);

export function createAssistantHost(deps: {
  spaces: Spaces;
  tag: EvmlTag;
  /** Runs code on a fork. It is given the code and where to run it from,
   *  and nothing that could sign or send. */
  simulate(
    script: string,
    opts: { from?: string; blockNumber?: number },
  ): Promise<SimulationResult>;
}): AssistantHost {
  const { spaces } = deps;
  let turn: Turn | null = null;

  const refuse = (error: string) => ({ ok: false as const, error });
  const noSpace = (id: string | undefined) =>
    id ? `No space with id ${id}. Call list_spaces.` : NO_SPACE;

  /** The space a call means: the one it names, else (only when it names
   *  none) the one the user was looking at when they sent the message.
   *  Never the one on screen now, and always one of the user's own spaces
   *  as the registry lists them: anything else, an empty id included, is
   *  no space. */
  const target = (space: string | undefined) => {
    const id = space === undefined ? turn?.scope : space;
    return id !== undefined &&
      spaces.index.getState().some((meta) => meta.id === id)
      ? id
      : undefined;
  };

  const edit = async (
    request: ScriptEditRequest,
    change: ScriptEdit,
  ): Promise<ScriptEditResult> => {
    const current = turn;
    if (!current) return refuse("No message is being answered.");
    // Checked here whatever the tool's schema did: this line is kept in
    // a record other people and other programs will read.
    const explanation = plainLine(String(request.explanation ?? ""));
    if (!explanation || explanation.length > MAX_EXPLANATION)
      return refuse(
        `An edit needs an explanation: one plain sentence of at most ${MAX_EXPLANATION} characters.`,
      );
    const id = target(request.space);
    // Among the user's own spaces, or nowhere: an id is never made.
    const space = id ? await spaces.acquire(id) : null;
    if (!id || !space) return refuse(noSpace(request.space));
    // Loading takes a moment: the turn may have ended, or been stopped.
    if (turn !== current) {
      spaces.release(id);
      return refuse("The message is no longer being answered.");
    }
    // Held once for the whole turn; a hold taken again is given back.
    const held = current.edited.get(id);
    if (held?.space === space) spaces.release(id);
    else current.edited.set(id, { space, explanations: [] });
    const result = space.editAsTurn(current.id, change);
    if (!result.ok) return result;
    const { explanations } = current.edited.get(id)!;
    if (!explanations.includes(explanation)) explanations.push(explanation);
    return { ok: true, space: id };
  };

  const read = async <T>(
    space: string | undefined,
    use: (space: LiveSpace) => T,
  ): Promise<T | null> => {
    const id = target(space);
    const live = id ? await spaces.acquire(id) : null;
    if (!id || !live) return null;
    try {
      return use(live);
    } finally {
      spaces.release(id);
    }
  };

  return {
    turn: () => turn,
    beginTurn(next) {
      turn = { ...next, edited: new Map() };
    },
    endTurn(turnId) {
      if (turn?.id !== turnId) return;
      const ended = turn;
      turn = null;
      for (const [id, { space, explanations }] of ended.edited) {
        // Several edits, several sentences: still one line of bounded length.
        const summary = explanations.join(" ").slice(0, MAX_SUMMARY);
        const revision = space.endTurn(turnId, summary || undefined);
        // Private to this browser: lets the revision's row offer "Open
        // chat". The revision itself carries only the explanation.
        if (revision)
          void space.setMarkers({
            revisionChats: {
              ...space.markers.getState().revisionChats,
              [revision.id]: ended.chatId,
            },
          });
        spaces.release(id);
      }
    },
    tools: {
      tag: deps.tag,
      getScript: (space) => read(space, (live) => live.getText()),
      applyStrReplace: (oldString, newString, request) =>
        edit(request, { kind: "replace", oldString, newString }),
      applyWrite: (text, request) => edit(request, { kind: "write", text }),
      simulate: (script, { from, blockNumber }) =>
        deps.simulate(script, { from, blockNumber }),
      revisionOf: async (space) =>
        (await read(space, (live) => {
          const last = head(live.timeline.getState());
          return last?.text === live.getText() ? last.id : undefined;
        })) ?? undefined,
      listSpaces: () =>
        spaces.index.getState().map(({ id, title, unreviewed, run }) => ({
          id,
          title,
          ...(id === turn?.scope ? { current: true } : {}),
          unreviewed,
          ...(run ? { run } : {}),
        })),
      // Another space's script and timeline enter the conversation here,
      // as the user's own data. Its private marks and the chats do not.
      readSpace: (space) =>
        read(space, (live) => ({
          script: live.getText(),
          timeline: recent(live.timeline.getState()),
        })),
    },
  };
}

const NO_SPACE = "No space is open. Call list_spaces.";
