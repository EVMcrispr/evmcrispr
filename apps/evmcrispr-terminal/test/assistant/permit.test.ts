import { describe, expect, test } from "bun:test";
import {
  type Call,
  type ChatPermissions,
  EVERY_SPACE,
  NO_PERMISSIONS,
  permit,
  type ToolKind,
  toolKind,
} from "../../src/assistant/permit";

const known = new Set(["A", "B", "C"]);
/** `scope` null: no space was on screen when the message was sent. */
const call = (kind: ToolKind, named?: unknown, scope: string | null = "A") =>
  ({ ...kind, named, scope: scope ?? undefined, known }) satisfies Call;
const state = (patch: Partial<ChatPermissions> = {}): ChatPermissions => ({
  ...NO_PERMISSIONS,
  ...patch,
});

const READ: ToolKind = { space: "read" };
const EDIT: ToolKind = { space: "edit" };
const WEB: ToolKind = { web: true };
const LIST: ToolKind = { lists: true };
const SIMULATE: ToolKind = { space: "read", web: true };
const NOTHING: ToolKind = {};

const ALLOW = "allow";
const ASK_WEB = "ask web";
const askEdit = (space: string) => `ask edit ${space}`;
const ERROR = "error";

function outcome(permissions: ChatPermissions, c: Call): string {
  const verdict = permit(permissions, c);
  if (verdict.allow) return ALLOW;
  if ("error" in verdict) return ERROR;
  return verdict.ask.what === "web" ? ASK_WEB : askEdit(verdict.ask.space);
}

describe("permit", () => {
  // [what it shows, what the chat took in and was allowed, the call, outcome]
  const table: [string, ChatPermissions, Call, string][] = [
    // The space the message was sent from: nothing asks.
    ["read here", state(), call(READ), ALLOW],
    ["read here, named", state(), call(READ, "A"), ALLOW],
    ["edit here", state(), call(EDIT), ALLOW],
    ["edit here after web", state({ web: true }), call(EDIT), ALLOW],
    ["read here after web", state({ web: true }), call(READ), ALLOW],
    ["web after reading here", state({ read: ["A"] }), call(WEB), ALLOW],
    [
      "simulate here after web",
      state({ read: ["A"], web: true }),
      call(SIMULATE),
      ALLOW,
    ],
    ["web first", state(), call(WEB), ALLOW],
    [
      "a tool that does neither, whatever was taken in",
      state({ read: ["B"], web: true }),
      call(NOTHING),
      ALLOW,
    ],

    // Reading another space.
    ["read another", state(), call(READ, "B"), ALLOW],
    ["read another after web", state({ web: true }), call(READ, "B"), ASK_WEB],
    [
      "read another after web, refused before",
      state({ web: true, webWithSpaces: false }),
      call(READ, "B"),
      ASK_WEB,
    ],
    [
      "read another after web, allowed",
      state({ web: true, webWithSpaces: true }),
      call(READ, "B"),
      ALLOW,
    ],
    ["list spaces", state(), call(LIST), ALLOW],
    ["list spaces after web", state({ web: true }), call(LIST), ASK_WEB],

    // The web after another space.
    [
      "web after reading another",
      state({ read: ["A", "B"] }),
      call(WEB),
      ASK_WEB,
    ],
    [
      "web after listing spaces",
      state({ read: [EVERY_SPACE] }),
      call(WEB),
      ASK_WEB,
    ],
    [
      "web after reading another, allowed",
      state({ read: ["B"], webWithSpaces: true }),
      call(WEB),
      ALLOW,
    ],
    ["simulate another space", state(), call(SIMULATE, "B"), ASK_WEB],
    [
      "simulate here after reading another",
      state({ read: ["B"] }),
      call(SIMULATE),
      ASK_WEB,
    ],
    // What was "here" when it was read is another space for a message
    // sent from elsewhere.
    [
      "web from B after reading A in A",
      state({ read: ["A"] }),
      call(WEB, undefined, "B"),
      ASK_WEB,
    ],
    [
      "reading here again does not ask, whatever the chat holds",
      state({ read: ["A"], web: true }),
      call(READ, undefined, "B"),
      ALLOW,
    ],

    // Editing another space: that space, in that chat, by the user's word.
    ["edit another", state(), call(EDIT, "B"), askEdit("B")],
    ["edit another, allowed", state({ edit: ["B"] }), call(EDIT, "B"), ALLOW],
    [
      "B allowed does not allow C",
      state({ edit: ["B"] }),
      call(EDIT, "C"),
      askEdit("C"),
    ],
    [
      "the web answer does not allow an edit",
      state({ webWithSpaces: true }),
      call(EDIT, "B"),
      askEdit("B"),
    ],
    [
      "an edit allowed is still another space's content: after web it asks",
      state({ edit: ["B"], web: true }),
      call(EDIT, "B"),
      ASK_WEB,
    ],
    [
      "and both answers allow it",
      state({ edit: ["B"], web: true, webWithSpaces: true }),
      call(EDIT, "B"),
      ALLOW,
    ],
    [
      "here is B now: editing A is another space",
      state({ edit: [] }),
      call(EDIT, "A", "B"),
      askEdit("A"),
    ],

    // A space id is one of the user's spaces.
    ["an unknown id", state(), call(READ, "nope"), ERROR],
    [
      "an unknown id to edit, even with everything allowed",
      state({ edit: ["nope"], webWithSpaces: true }),
      call(EDIT, "nope"),
      ERROR,
    ],
    ["an empty id is not 'omitted'", state(), call(READ, ""), ERROR],
    ["an id that is not a string", state(), call(EDIT, { id: "A" }), ERROR],
    ["null is not 'omitted'", state(), call(READ, null), ERROR],
    [
      "no space open and none named",
      state(),
      call(READ, undefined, null),
      ERROR,
    ],
    [
      "a scope that is no longer a space",
      state(),
      call(EDIT, undefined, "gone"),
      ERROR,
    ],
    [
      "an id only matters to a tool that takes one",
      state(),
      call(WEB, "nope"),
      ALLOW,
    ],
  ];
  for (const [name, permissions, c, expected] of table)
    test(name, () => expect(outcome(permissions, c)).toBe(expected));

  test("an allowed call reports what the chat has taken in, and never touches the answers", () => {
    const before = state({ edit: ["B"], webWithSpaces: true });
    const verdict = permit(before, call(SIMULATE, "B"));
    expect(verdict).toEqual({
      allow: true,
      space: "B",
      state: { read: ["B"], web: true, edit: ["B"], webWithSpaces: true },
    });
    expect(before).toEqual(state({ edit: ["B"], webWithSpaces: true }));
  });

  test("a call that asks or errors changes nothing", () => {
    for (const c of [call(EDIT, "B"), call(READ, "nope")])
      expect("state" in permit(state(), c)).toBe(false);
  });
});

test("every tool is what the rule takes it for", () => {
  expect(toolKind("get_script", {})).toEqual({ space: "read" });
  expect(toolKind("edit_script", {})).toEqual({ space: "edit" });
  expect(toolKind("write_script", {})).toEqual({ space: "edit" });
  expect(toolKind("read_space", {})).toEqual({ space: "read" });
  expect(toolKind("list_spaces", {})).toEqual({ lists: true });
  for (const name of ["search_web", "fetch_page", "get_contract"])
    expect(toolKind(name, {})).toEqual({ web: true });
  // The script of a space, or a snippet: both can reach the web.
  expect(toolKind("simulate_script", {})).toEqual({ space: "read", web: true });
  expect(
    toolKind("simulate_script", { script: "print 1", space: "B" }),
  ).toEqual({ web: true });
  expect(toolKind("get_docs", {})).toEqual({});
});
