import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Bundled docs (exists after `prebuild` or in published npm package)
const BUNDLED_DOCS = resolve(import.meta.dirname, "../../docs");
// Monorepo root (fallback for local dev without building)
const MONOREPO_ROOT = resolve(import.meta.dirname, "../../../..");

const MODULES = ["std", "sim", "aragonos", "ens", "giveth", "http"];

let fullDocsCache: string | null = null;
const moduleDocsCache = new Map<string, string>();
const commandDocsCache = new Map<string, string>();
const helperDocsCache = new Map<string, string>();

function cacheKey(module: string, name: string): string {
  return `${module}/${name}`;
}

/** Check whether bundled docs are available */
function hasBundledDocs(): boolean {
  return existsSync(join(BUNDLED_DOCS, "llms-full.txt"));
}

// --- Path resolvers ---

function fullDocsPath(): string {
  if (hasBundledDocs()) return join(BUNDLED_DOCS, "llms-full.txt");
  return join(MONOREPO_ROOT, "apps/evmcrispr-website/public/llms-full.txt");
}

function moduleDocsPath(moduleName: string): string {
  if (hasBundledDocs())
    return join(BUNDLED_DOCS, "modules", moduleName, "README.md");
  return join(MONOREPO_ROOT, "modules", moduleName, "README.md");
}

function commandDocsPath(moduleName: string, commandName: string): string {
  if (hasBundledDocs())
    return join(
      BUNDLED_DOCS,
      "modules",
      moduleName,
      "commands",
      `${commandName}.md`,
    );
  return join(
    MONOREPO_ROOT,
    "modules",
    moduleName,
    "src/commands",
    `${commandName}.md`,
  );
}

function helperDocsPath(moduleName: string, helperName: string): string {
  if (hasBundledDocs())
    return join(
      BUNDLED_DOCS,
      "modules",
      moduleName,
      "helpers",
      `${helperName}.md`,
    );
  return join(
    MONOREPO_ROOT,
    "modules",
    moduleName,
    "src/helpers",
    `${helperName}.md`,
  );
}

function commandsDir(moduleName: string): string {
  if (hasBundledDocs())
    return join(BUNDLED_DOCS, "modules", moduleName, "commands");
  return join(MONOREPO_ROOT, "modules", moduleName, "src/commands");
}

function helpersDir(moduleName: string): string {
  if (hasBundledDocs())
    return join(BUNDLED_DOCS, "modules", moduleName, "helpers");
  return join(MONOREPO_ROOT, "modules", moduleName, "src/helpers");
}

// --- Public API ---

export async function loadFullDocs(): Promise<string> {
  if (fullDocsCache) return fullDocsCache;

  fullDocsCache = await readFile(fullDocsPath(), "utf-8");
  return fullDocsCache;
}

export async function loadModuleDocs(
  moduleName: string,
): Promise<string | null> {
  if (moduleDocsCache.has(moduleName)) return moduleDocsCache.get(moduleName)!;

  try {
    const content = await readFile(moduleDocsPath(moduleName), "utf-8");
    moduleDocsCache.set(moduleName, content);
    return content;
  } catch {
    return null;
  }
}

export async function loadCommandDocs(
  moduleName: string,
  commandName: string,
): Promise<string | null> {
  const key = cacheKey(moduleName, commandName);
  if (commandDocsCache.has(key)) return commandDocsCache.get(key)!;

  try {
    const content = await readFile(
      commandDocsPath(moduleName, commandName),
      "utf-8",
    );
    commandDocsCache.set(key, content);
    return content;
  } catch {
    return null;
  }
}

export async function loadHelperDocs(
  moduleName: string,
  helperName: string,
): Promise<string | null> {
  const key = cacheKey(moduleName, helperName);
  if (helperDocsCache.has(key)) return helperDocsCache.get(key)!;

  try {
    const content = await readFile(
      helperDocsPath(moduleName, helperName),
      "utf-8",
    );
    helperDocsCache.set(key, content);
    return content;
  } catch {
    return null;
  }
}

export async function listModules(): Promise<string[]> {
  return MODULES;
}

export async function listModuleCommands(
  moduleName: string,
): Promise<string[]> {
  try {
    const entries = await readdir(commandsDir(moduleName));
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => e.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

export async function listModuleHelpers(moduleName: string): Promise<string[]> {
  try {
    const entries = await readdir(helpersDir(moduleName));
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => e.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}
