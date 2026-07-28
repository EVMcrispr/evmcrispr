import { sortModuleNames } from "@evmcrispr/modules/order";

export type ReferenceEntry = {
  name: string;
  kind: "command" | "helper";
  module: string;
  description: string;
  returnType?: string;
  argDefs?: Array<{
    name: string;
    type: string;
    optional?: boolean;
    rest?: boolean;
  }>;
  loadDocs: () => Promise<string>;
};

export type ConfigEntry = {
  name: string;
  type: string;
  description: string;
  default?: string;
};

export type ModuleDef = {
  name: string;
  /** Whole module only available when VITE_PUBLIC_EXPERIMENTAL is enabled. */
  experimental?: boolean;
  commands: Record<string, { description?: string; experimental?: boolean }>;
  helpers: Record<
    string,
    {
      description?: string;
      experimental?: boolean;
      returnType?: string | string[];
      argDefs?: Array<{
        name: string;
        type: string | string[];
        optional?: boolean;
        rest?: boolean;
      }>;
    }
  >;
  configs?: Array<{
    name: string;
    type: string | string[];
    description: string;
    default?: string;
  }>;
};

/** Declared config variables per module, in display order. */
export function buildModuleConfigs(
  modules: ModuleDef[],
): Map<string, ConfigEntry[]> {
  const map = new Map<string, ConfigEntry[]>();
  for (const mod of modules) {
    if (!mod.configs?.length) continue;
    map.set(
      mod.name,
      mod.configs.map((c) => ({
        name: c.name,
        type: Array.isArray(c.type) ? c.type.join(" | ") : c.type,
        description: c.description,
        default: c.default,
      })),
    );
  }
  return map;
}

/** Sort modules into display order: core modules first, rest alphabetical. */
export function sortModules(modules: ModuleDef[]): ModuleDef[] {
  const order = sortModuleNames(modules.map((m) => m.name));
  return [...modules].sort(
    (a, b) => order.indexOf(a.name) - order.indexOf(b.name),
  );
}

export function buildReferenceEntries(
  modules: ModuleDef[],
  loadDoc: (
    module: string,
    kind: "command" | "helper",
    name: string,
  ) => Promise<string>,
  includeExperimental = true,
): ReferenceEntry[] {
  return modules.flatMap(({ name: moduleName, commands, helpers }) => {
    const cmdEntries: ReferenceEntry[] = Object.entries(commands)
      .filter(([, entry]) => includeExperimental || !entry.experimental)
      .map(([name, entry]) => ({
        name,
        kind: "command" as const,
        module: moduleName,
        description: entry.description ?? "",
        loadDocs: () => loadDoc(moduleName, "command", name).catch(() => ""),
      }));

    const helperEntries: ReferenceEntry[] = Object.entries(helpers)
      .filter(([, entry]) => includeExperimental || !entry.experimental)
      .map(([name, entry]) => ({
        name,
        kind: "helper" as const,
        module: moduleName,
        description: entry.description ?? "",
        returnType: Array.isArray(entry.returnType)
          ? entry.returnType.join(" | ")
          : entry.returnType,
        argDefs: entry.argDefs?.map((a) => ({
          name: a.name,
          type: Array.isArray(a.type) ? a.type.join(" | ") : a.type,
          optional: a.optional,
          rest: a.rest,
        })),
        loadDocs: () => loadDoc(moduleName, "helper", name).catch(() => ""),
      }));

    return [...cmdEntries, ...helperEntries];
  });
}

/**
 * Resolve a doc markdown link (as authored in module docs, e.g.
 * "../helpers/contract.next.md" or "../../../std/src/commands/exec.md")
 * to a reference entry.
 *
 * Returns null when the href is not a relative .md link (leave it as a
 * regular external link) and "unresolved" when it looks like a doc link but
 * no entry matches (render as plain text instead of a dead URL).
 */
export function resolveDocLinkEntry(
  entries: ReferenceEntry[],
  href: string,
  currentModule?: string,
): ReferenceEntry | "unresolved" | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null; // absolute URL
  const path = href.split(/[#?]/)[0];
  const match = path.match(/([^/]+)\.md$/);
  if (!match) return null;

  const name = decodeURIComponent(match[1]);
  const segments = path.split("/");
  const parentDir = segments[segments.length - 2];
  const kind =
    parentDir === "commands"
      ? "command"
      : parentDir === "helpers"
        ? "helper"
        : null;
  // Cross-module links contain the module dir (e.g. ".../std/src/helpers/")
  const module = path.match(/(?:^|\/)([\w-]+)\/src\//)?.[1] ?? currentModule;

  const candidates = entries.filter(
    (e) => e.name === name && (!kind || e.kind === kind),
  );
  if (candidates.length === 0) return "unresolved";
  return candidates.find((e) => e.module === module) ?? candidates[0];
}
