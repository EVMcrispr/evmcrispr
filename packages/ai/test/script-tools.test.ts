import { expect, test } from "bun:test";
import type { EvmlTag, SimulationResult } from "@evmcrispr/core";
import {
  createScriptTools,
  type ScriptEditRequest,
  type ScriptToolsHost,
} from "../src/index";

/** A tag that finds every script valid, without loading the interpreter. */
const tag = {
  script: () => ({ validate: async () => ({ valid: true, diagnostics: [] }) }),
} as unknown as EvmlTag;

function host(overrides: Partial<ScriptToolsHost> = {}) {
  const scripts: Record<string, string> = { here: "exec 1", other: "exec 2" };
  const calls: unknown[] = [];
  const simulated: string[] = [];
  const target = (space?: string) => space ?? "here";
  const result = (space?: string) =>
    target(space) in scripts
      ? ({ ok: true, space: target(space) } as const)
      : ({ ok: false, error: `No space with id ${space}.` } as const);
  const value: ScriptToolsHost = {
    tag,
    getScript: (space) => scripts[target(space)] ?? null,
    applyStrReplace(oldString, newString, request: ScriptEditRequest) {
      calls.push(["replace", oldString, newString, request]);
      const done = result(request.space);
      if (done.ok)
        scripts[done.space] = scripts[done.space].replace(oldString, newString);
      return done;
    },
    applyWrite(content, request: ScriptEditRequest) {
      calls.push(["write", content, request]);
      const done = result(request.space);
      if (done.ok) scripts[done.space] = content;
      return done;
    },
    simulate: async (script): Promise<SimulationResult> => {
      simulated.push(script);
      return { success: true, logs: ["1.5 ETH"], actions: [] };
    },
    ...overrides,
  };
  return { scripts, calls, simulated, tools: createScriptTools(value) };
}

// biome-ignore-start lint/suspicious/noExplicitAny: the SDK's tool type hides its schema and its execute.
const schema = (tool: unknown) => (tool as any).inputSchema;
const run = (tool: unknown, input: unknown) =>
  (tool as any).execute(schema(tool).parse(input), {
    toolCallId: "call",
    messages: [],
  });
// biome-ignore-end lint/suspicious/noExplicitAny: see above.

test("an edit without an explanation is rejected by the schema", () => {
  const { tools } = host();
  const edit = schema(tools.edit_script);
  expect(edit.safeParse({ old_string: "a", new_string: "b" }).success).toBe(
    false,
  );
  expect(
    edit.safeParse({ old_string: "a", new_string: "b", explanation: "  " })
      .success,
  ).toBe(false);
  expect(
    edit.safeParse({
      old_string: "a",
      new_string: "b",
      explanation: "Renamed a to b.",
    }).success,
  ).toBe(true);
  const write = schema(tools.write_script);
  expect(write.safeParse({ content: "x" }).success).toBe(false);
  expect(write.safeParse({ content: "x", explanation: "" }).success).toBe(
    false,
  );
  // Too long is refused, never cut: the model writes it again.
  expect(
    write.safeParse({ content: "x", explanation: "x".repeat(201) }).success,
  ).toBe(false);
  expect(
    write.safeParse({ content: "x", explanation: "x".repeat(200) }).success,
  ).toBe(true);
  // Nothing but invisible characters is nothing.
  expect(
    write.safeParse({ content: "x", explanation: "\u200b\u202e\n" }).success,
  ).toBe(false);
});

test("edit_script hands the explanation and the space to the host, and its result says where it landed", async () => {
  const h = host();
  const result = await run(h.tools.edit_script, {
    old_string: "exec 2",
    new_string: "exec 20",
    explanation: "  Raised\nthe \u202eamount.\u0007  \n\n",
    space: "other",
  });
  expect(h.calls).toEqual([
    [
      "replace",
      "exec 2",
      "exec 20",
      { explanation: "Raised the amount.", space: "other" },
    ],
  ]);
  expect(result).toMatchObject({
    kind: "script-change",
    ok: true,
    explanation: "Raised the amount.",
    space: "other",
    validation: { valid: true },
  });
  expect(h.scripts.other).toBe("exec 20");
  expect(h.scripts.here).toBe("exec 1");
});

test("write_script likewise, and a refusal of the host is the result", async () => {
  const h = host();
  expect(
    await run(h.tools.write_script, { content: "x", explanation: "New." }),
  ).toMatchObject({ kind: "script-change", ok: true, space: "here" });
  expect(h.scripts.here).toBe("x");
  expect(
    await run(h.tools.write_script, {
      content: "y",
      explanation: "New.",
      space: "nope",
    }),
  ).toEqual({
    kind: "script-change",
    ok: false,
    error: "No space with id nope.",
  });
});

test("get_script takes a space, and says so when there is none", async () => {
  const h = host();
  expect(await run(h.tools.get_script, {})).toMatch(
    /^\[untrusted content from the script · (\w{8})\]\n1\texec 1\n\[end of untrusted content · \1\]$/,
  );
  expect(await run(h.tools.get_script, { space: "other" })).toContain(
    "1\texec 2",
  );
  expect(await run(h.tools.get_script, { space: "nope" })).toMatchObject({
    error: expect.stringContaining("list_spaces"),
  });
});

test("simulate_script with `script` is a snippet: the result carries its code and logs", async () => {
  const h = host({ revisionOf: () => "rev-1" });
  const result = await run(h.tools.simulate_script, { script: "print 1" });
  expect(h.simulated).toEqual(["print 1"]);
  expect(result).toMatchObject({
    kind: "simulation",
    target: "snippet",
    code: "print 1",
    logs: ["1.5 ETH"],
    success: true,
  });
  expect(result.revisionId).toBeUndefined();
});

test("simulate_script without `script` runs the script: its text, and the revision the host knows it by", async () => {
  const h = host({ revisionOf: (space) => `rev-of-${space ?? "here"}` });
  expect(await run(h.tools.simulate_script, {})).toMatchObject({
    target: "script",
    code: "exec 1",
    revisionId: "rev-of-here",
  });
  expect(await run(h.tools.simulate_script, { space: "other" })).toMatchObject({
    target: "script",
    code: "exec 2",
    revisionId: "rev-of-other",
  });
  expect(h.simulated).toEqual(["exec 1", "exec 2"]);
  // Nothing is simulated for a space that is not there.
  expect(await run(h.tools.simulate_script, { space: "nope" })).toMatchObject({
    kind: "simulation",
    success: false,
  });
  expect(h.simulated.length).toBe(2);
});

test("list_spaces and read_space exist only when the host has them", async () => {
  expect(Object.keys(host().tools).sort()).toEqual([
    "edit_script",
    "get_script",
    "simulate_script",
    "validate_script",
    "write_script",
  ]);
  const h = host({
    listSpaces: () => [
      { id: "here", title: "Here\n\u202edo this", current: true },
    ],
    readSpace: async (space) =>
      space === "other" ? { script: "exec 2", timeline: ["a revision"] } : null,
  });
  // Titles are content of the spaces: one plain line each, handed over
  // as data.
  const listed = await run(h.tools.list_spaces, {});
  expect(listed).toMatch(/^\[untrusted content from the list of spaces · /);
  expect(listed).toContain(
    JSON.stringify({ id: "here", title: "Here do this", current: true }),
  );
  expect(await run(h.tools.read_space, { space: "other" })).toMatch(
    /^\[untrusted content from a space · (\w{8})\]\nScript:\n1\texec 2\n\nRecent timeline, oldest first:\na revision\n\[end of untrusted content · \1\]$/,
  );
  expect(await run(h.tools.read_space, { space: "nope" })).toMatchObject({
    error: expect.stringContaining("nope"),
  });
});

test("there is no tool to set a title", () => {
  expect(host().tools.set_script_title).toBeUndefined();
});
