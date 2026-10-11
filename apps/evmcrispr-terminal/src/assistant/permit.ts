// What a tool call of the assistant may do without asking the user. The
// assistant acts on text it read (a web page, a script's comments, an
// explanation in a timeline), so whoever can put text in front of it could
// borrow the user's reach over every space. The rule, in one function:
//  - the space the message was sent from: read and edit freely;
//  - another space: read freely, edit only once the user allowed that
//    space in that chat;
//  - the web together with content of other spaces, in either order: only
//    once the user allowed it in that chat (content could be sent out);
//  - a space id is one of the user's own spaces, or the call is an error.
// It is asked at every tool call. The answers are the user's clicks, kept
// with the chat in the private store; nothing a tool takes or returns can
// change them.
import type { ChatPermissions } from "../storage/records";

export type { ChatPermissions };

export const NO_PERMISSIONS: ChatPermissions = {
  read: [],
  web: false,
  edit: [],
};

/** Stands for the list of spaces (their titles) among what was read. */
export const EVERY_SPACE = "*";

/** What a tool does, as far as the rule cares. */
export interface ToolKind {
  /** Acts on a space: the one it names, else the turn's. */
  space?: "read" | "edit";
  /** Takes in the titles of every space. */
  lists?: boolean;
  /** Reaches outside the browser: content comes in, and what it is
   *  given (a query, a URL, an address, code that can fetch) goes out. */
  web?: boolean;
}

/** Every tool the rule knows. A tool that is not here does neither. A
 *  simulation is a web channel: a snippet can load the `http` module. */
const TOOLS: Record<string, ToolKind> = {
  get_script: { space: "read" },
  validate_script: { space: "read" },
  read_space: { space: "read" },
  edit_script: { space: "edit" },
  write_script: { space: "edit" },
  simulate_script: { space: "read", web: true },
  list_spaces: { lists: true },
  search_web: { web: true },
  fetch_page: { web: true },
  get_contract: { web: true },
};

export function toolKind(name: string, input: unknown): ToolKind {
  const kind = TOOLS[name] ?? {};
  // A snippet is run instead of a space's script.
  const snippet =
    name === "simulate_script" &&
    (input as { script?: unknown } | null)?.script !== undefined;
  return snippet ? { web: true } : kind;
}

export interface Call extends ToolKind {
  /** The space the message was sent from, captured when it was sent. */
  scope: string | undefined;
  /** The space id the model gave. Only `undefined` means the turn's. */
  named: unknown;
  /** The user's own spaces, as the registry lists them. */
  known: ReadonlySet<string>;
}

export type Ask = { what: "web" } | { what: "edit"; space: string };

export type Verdict =
  /** Runs. `state` is what the chat has taken in once it has. */
  | { allow: true; state: ChatPermissions; space?: string }
  | { allow: false; ask: Ask }
  | { allow: false; error: string };

const others = (read: readonly string[], scope: string | undefined) =>
  read.some((id) => id !== scope);

export function permit(state: ChatPermissions, call: Call): Verdict {
  let space: string | undefined;
  if (call.space) {
    const id = call.named === undefined ? call.scope : call.named;
    if (typeof id !== "string" || !call.known.has(id))
      return {
        allow: false,
        error:
          call.named === undefined
            ? "No space is open. Call list_spaces."
            : `No space with id ${String(call.named).slice(0, 80)}. Call list_spaces.`,
      };
    space = id;
  }
  if (
    call.space === "edit" &&
    space !== undefined &&
    space !== call.scope &&
    !state.edit.includes(space)
  )
    return { allow: false, ask: { what: "edit", space } };

  const takes = [
    ...(space === undefined ? [] : [space]),
    ...(call.lists ? [EVERY_SPACE] : []),
  ];
  const read = [...new Set([...state.read, ...takes])];
  const web = state.web || call.web === true;
  // This call would put the web and another space's content in one chat.
  const mixes =
    (call.web === true && others(read, call.scope)) ||
    (others(takes, call.scope) && web);
  if (mixes && state.webWithSpaces !== true)
    return { allow: false, ask: { what: "web" } };
  return { allow: true, state: { ...state, read, web }, space };
}
