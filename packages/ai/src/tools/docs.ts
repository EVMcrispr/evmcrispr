/// <reference types="vite/client" />

/**
 * Browser-side loader for the generated EVML docs, mirroring the API of the
 * MCP server's docs-loader (which is node:fs based). The markdown files are
 * pulled from the workspace module packages via lazy glob imports (a Vite
 * feature), so each doc is only fetched when the chat assistant asks for it.
 * Any host bundling this package with Vite gets these for free, since the
 * glob is relative to this file inside the EVMcrispr repo's `packages/chat`.
 */

type RawImports = Record<string, () => Promise<string>>;

/** `import.meta.glob` only exists under Vite (which statically transforms
 *  the literal calls below). In other runtimes (bun test, node) the call
 *  throws at module load — degrade to an empty doc set instead. */
function safeGlob(load: () => RawImports): RawImports {
  try {
    return load();
  } catch {
    return {};
  }
}

const moduleReadmes = safeGlob(
  () =>
    import.meta.glob("../../../../modules/*/README.md", {
      query: "?raw",
      import: "default",
    }) as RawImports,
);

const commandDocs = safeGlob(
  () =>
    import.meta.glob("../../../../modules/*/src/commands/*.md", {
      query: "?raw",
      import: "default",
    }) as RawImports,
);

const helperDocs = safeGlob(
  () =>
    import.meta.glob("../../../../modules/*/src/helpers/*.md", {
      query: "?raw",
      import: "default",
    }) as RawImports,
);

function indexByModule(
  imports: RawImports,
  pathRe: RegExp,
): Map<string, Map<string, () => Promise<string>>> {
  const index = new Map<string, Map<string, () => Promise<string>>>();
  for (const [path, load] of Object.entries(imports)) {
    const match = pathRe.exec(path);
    if (!match) continue;
    const [, moduleName, docName] = match;
    let docs = index.get(moduleName);
    if (!docs) {
      docs = new Map();
      index.set(moduleName, docs);
    }
    docs.set(docName, load);
  }
  return index;
}

const readmeIndex = indexByModule(
  moduleReadmes,
  /modules\/([^/]+)\/(README)\.md$/,
);
const commandIndex = indexByModule(
  commandDocs,
  /modules\/([^/]+)\/src\/commands\/(.+)\.md$/,
);
const helperIndex = indexByModule(
  helperDocs,
  /modules\/([^/]+)\/src\/helpers\/(.+)\.md$/,
);

/** All module names, std first (it needs no `load`), then alphabetical. */
export const MODULES = [...readmeIndex.keys()].sort((a, b) =>
  a === "std" ? -1 : b === "std" ? 1 : a.localeCompare(b),
);

export async function loadModuleDocs(
  moduleName: string,
): Promise<string | null> {
  const load = readmeIndex.get(moduleName)?.get("README");
  return load ? load() : null;
}

export async function loadCommandDocs(
  moduleName: string,
  commandName: string,
): Promise<string | null> {
  const load = commandIndex.get(moduleName)?.get(commandName);
  return load ? load() : null;
}

export async function loadHelperDocs(
  moduleName: string,
  helperName: string,
): Promise<string | null> {
  const load = helperIndex.get(moduleName)?.get(helperName);
  return load ? load() : null;
}

/**
 * One-line overview of a module, extracted from the first paragraph of its
 * README (the line right after the `# <name> module` heading).
 */
export async function getModuleOverview(
  moduleName: string,
): Promise<string | null> {
  const readme = await loadModuleDocs(moduleName);
  if (!readme) return null;

  const lines = readme.split("\n");
  const headingIdx = lines.findIndex((l) => l.startsWith("# "));
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    if (line.startsWith("#") || line.startsWith("```")) break;
    return line;
  }
  return null;
}
