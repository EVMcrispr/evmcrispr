import { expect, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";

const SRC = path.resolve(import.meta.dir, "../../src");

/** Every module of the app with what it imports, as written. */
async function importGraph() {
  const graph = new Map<string, string[]>();
  for await (const file of new Glob("**/*.{ts,tsx}").scan(SRC)) {
    const source = await Bun.file(path.join(SRC, file)).text();
    graph.set(
      file,
      [
        ...source.matchAll(
          /\bfrom\s+"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)|^import\s+"([^"]+)"/gm,
        ),
      ].map((match) => match[1] ?? match[2] ?? match[3]),
    );
  }
  return graph;
}

/** A relative import as the module of the graph it names, if it is one. */
function resolve(graph: Map<string, string[]>, from: string, spec: string) {
  if (!spec.startsWith(".")) return undefined;
  const base = path.join(path.dirname(from), spec);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((file) =>
    graph.has(file),
  );
}

/** What a module reaches, following the app's own imports. */
function reach(graph: Map<string, string[]>, root: string) {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (modules.has(file)) return;
    modules.add(file);
    for (const spec of graph.get(file) ?? []) {
      const local = resolve(graph, file, spec);
      if (local) visit(local);
      else if (!spec.startsWith(".")) packages.add(spec);
    }
  };
  visit(root);
  return { modules: [...modules], packages: [...packages] };
}

const isEditor = (file: string) => file.startsWith("editor/");
const isMonaco = (spec: string) =>
  /^(monaco-editor|@monaco-editor\/|@evmcrispr\/editor\/monaco)/.test(spec);

// Content written by anyone but the user enters a space through
// `LiveSpace` only. What handles such content (the assistant, every
// transport, the loaded spaces themselves, storage) must not be able to
// reach the editor or a Monaco model, where a change counts as the user's.
// The modules are found by where they live, not listed.
// Runs and the timeline's rows are among them: a run record or an entry
// can come from another copy of the space.
const handlesForeignContent = (file: string) =>
  /^(assistant|space|storage|runs|review|panel\/(space|agents))\//.test(file) ||
  /transport/i.test(file);

test("nothing that handles foreign content can reach the editor or Monaco", async () => {
  const graph = await importGraph();
  const roots = [...graph.keys()].filter(handlesForeignContent);
  // The assistant host, a transport and the space live there today.
  expect(roots).toContain("assistant/host.ts");
  expect(roots).toContain("assistant/AssistantProvider.tsx");
  expect(roots).toContain("space/tab-transport.ts");
  expect(roots).toContain("space/live-space.ts");
  expect(roots).toContain("runs/run-manager.ts");
  expect(roots).toContain("panel/space/Timeline.tsx");
  expect(roots).toContain("review/ReviewDialog.tsx");
  for (const root of roots) {
    const { modules, packages } = reach(graph, root);
    expect({ root, editor: modules.filter(isEditor) }).toEqual({
      root,
      editor: [],
    });
    expect({ root, monaco: packages.filter(isMonaco) }).toEqual({
      root,
      monaco: [],
    });
  }
});

test("the script is written only by the space and by the editor binding", async () => {
  const graph = await importGraph();
  // The ways a Y.Text is written: its own methods, and the package's two.
  const writes =
    /\btext\.(insert|delete|applyDelta|format)\(|\b(applyText|strReplace)\(/;
  const writers: string[] = [];
  for (const file of graph.keys())
    if (writes.test(await Bun.file(path.join(SRC, file)).text()))
      writers.push(file);
  // conversions: typing. monaco-binding: the editor's content replaced.
  expect(writers.sort()).toEqual([
    "editor/conversions.ts",
    "editor/monaco-binding.ts",
    "space/live-space.ts",
  ]);
});

test("the assistant cannot approve: nothing of it names the approved text", async () => {
  const graph = await importGraph();
  const files = [...graph.keys()].filter((file) =>
    /^(assistant|panel\/agents)\//.test(file),
  );
  expect(files).toContain("assistant/host.ts");
  for (const file of files)
    expect({
      file,
      approves: /approvedText/.test(
        await Bun.file(path.join(SRC, file)).text(),
      ),
    }).toEqual({ file, approves: false });
});

test("a permission is given in one place: the prompt the user clicks", async () => {
  const graph = await importGraph();
  const granters: string[] = [];
  for (const file of graph.keys())
    if (/\.grant\(/.test(await Bun.file(path.join(SRC, file)).text()))
      granters.push(file);
  expect(granters).toEqual(["panel/agents/PermissionPrompt.tsx"]);
});

test("a text is approved in one place: the review the user clicks Approve in", async () => {
  const graph = await importGraph();
  const approvers: string[] = [];
  const setters: string[] = [];
  for (const file of graph.keys()) {
    const source = await Bun.file(path.join(SRC, file)).text();
    if (/\.approve\(/.test(source)) approvers.push(file);
    // The marker itself is written by the space alone: nothing else
    // both names it and writes marks.
    if (/approvedText/.test(source) && /\b(set|patch)Markers\(/.test(source))
      setters.push(file);
  }
  // useReview hands the space the text; WhatChanged is the button.
  expect(approvers.sort()).toEqual([
    "review/WhatChanged.tsx",
    "review/useReview.ts",
  ]);
  expect(setters).toEqual(["space/live-space.ts"]);
});

test("a run starts in one place, and a link is made in one place", async () => {
  const graph = await importGraph();
  const starters: string[] = [];
  const sharers: string[] = [];
  for (const file of graph.keys()) {
    const source = await Bun.file(path.join(SRC, file)).text();
    // The interpreter is handed a script to execute by the run manager
    // only, behind its review check.
    if (/\.execute\(/.test(source)) starters.push(file);
    if (/\bencryptScript\(/.test(source)) sharers.push(file);
  }
  expect(starters).toEqual(["runs/run-manager.ts"]);
  expect(sharers).toEqual(["space/links.ts"]);
});

test("the review is live for approving only when the user asked: it has one opener, called from handlers of their clicks", async () => {
  const graph = await importGraph();
  const askers: string[] = [];
  for (const file of graph.keys()) {
    const source = await Bun.file(path.join(SRC, file)).text();
    if (/\baskForReview\(/.test(source) && file !== "review/surface.ts")
      askers.push(file);
    // Wherever it is called, nothing was awaited first in that handler.
    for (const match of source.matchAll(/\baskForReview\(/g)) {
      if (file === "review/surface.ts") continue;
      const before = source.slice(0, match.index);
      const handler = before.slice(
        Math.max(
          before.lastIndexOf("=> {"),
          before.lastIndexOf("=>\n"),
          before.lastIndexOf("=> "),
          before.lastIndexOf("function "),
        ),
      );
      expect({ file, awaited: /\bawait\b/.test(handler) }).toEqual({
        file,
        awaited: false,
      });
    }
  }
  const surface = await Bun.file(path.join(SRC, "review/surface.ts")).text();
  // Its state is written by its own functions only: the store is not
  // exported, and the view state anyone can set holds nothing of it.
  expect(surface).not.toMatch(/export const store|export \{[^}]*\bstore\b/);
  const ui = await Bun.file(path.join(SRC, "app/ui-store.ts")).text();
  expect(ui).not.toMatch(/\breview/i);
  expect(askers.sort()).toEqual([
    "app/MobileLayout.tsx",
    "components/execution/ExecuteButton.tsx",
    "components/scripts/ShareScriptButton.tsx",
    "review/useReview.ts",
  ]);
});
