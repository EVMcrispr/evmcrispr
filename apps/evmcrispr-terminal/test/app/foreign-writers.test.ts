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
  /^(assistant|space|storage|runs|panel\/(space|agents))\//.test(file) ||
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
