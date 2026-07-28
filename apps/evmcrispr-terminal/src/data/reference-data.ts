// Auto-discovers every module in modules/ via import.meta.glob, so adding a
// module requires no edits here. Vite-only — bun tests must import
// reference-core.ts instead (import.meta.glob is a Vite macro).
import {
  buildModuleConfigs,
  buildReferenceEntries,
  type ModuleDef,
  type ReferenceEntry,
  resolveDocLinkEntry as resolveDocLinkEntryCore,
  sortModules,
} from "./reference-core";

export type { ConfigEntry, ReferenceEntry } from "./reference-core";

const experimentalOn =
  import.meta.env.VITE_PUBLIC_EXPERIMENTAL === "true" ||
  import.meta.env.VITE_PUBLIC_EXPERIMENTAL === "1";

const generated = import.meta.glob("../../../../modules/*/src/_generated.ts", {
  eager: true,
}) as Record<
  string,
  {
    commands?: ModuleDef["commands"];
    helpers?: ModuleDef["helpers"];
    configs?: ModuleDef["configs"];
    experimental?: boolean;
  }
>;

const docFiles = import.meta.glob(
  "../../../../modules/*/src/{commands,helpers}/*.md",
  { query: "?raw", import: "default" },
) as Record<string, () => Promise<string>>;

const modules: ModuleDef[] = sortModules(
  Object.entries(generated)
    .filter(([, mod]) => experimentalOn || mod.experimental !== true)
    .map(([path, mod]) => ({
      name: path.match(/modules\/([^/]+)\//)?.[1] ?? "",
      commands: mod.commands ?? {},
      helpers: mod.helpers ?? {},
      configs: mod.configs ?? [],
      experimental: mod.experimental,
    })),
);

/** Declared config variables per module (`$mod:key`), in display order. */
export const moduleConfigs = buildModuleConfigs(modules);

function loadDoc(
  module: string,
  kind: "command" | "helper",
  name: string,
): Promise<string> {
  const dir = kind === "command" ? "commands" : "helpers";
  const key = `../../../../modules/${module}/src/${dir}/${name}.md`;
  return docFiles[key]?.() ?? Promise.resolve("");
}

export const referenceEntries: ReferenceEntry[] = buildReferenceEntries(
  modules,
  loadDoc,
  experimentalOn,
);

/** All unique module names, in display order. */
export const moduleNames = modules.map((m) => m.name);

/** Fast lookup sets for cursor detection. */
export const commandNames = new Set(
  referenceEntries.filter((e) => e.kind === "command").map((e) => e.name),
);
export const helperNames = new Set(
  referenceEntries.filter((e) => e.kind === "helper").map((e) => e.name),
);

export function resolveDocLinkEntry(
  href: string,
  currentModule?: string,
): ReferenceEntry | "unresolved" | null {
  return resolveDocLinkEntryCore(referenceEntries, href, currentModule);
}
