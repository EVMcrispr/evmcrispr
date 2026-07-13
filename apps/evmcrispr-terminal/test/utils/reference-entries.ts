import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildReferenceEntries,
  type ModuleDef,
  type ReferenceEntry,
  sortModules,
} from "../../src/data/reference-core";

const MODULES_DIR = resolve(import.meta.dirname, "../../../../modules");

/**
 * Bun-test replacement for src/data/reference-data.ts, whose import.meta.glob
 * calls only work under Vite. Discovers modules from the filesystem instead.
 */
export async function loadReferenceEntries(): Promise<ReferenceEntry[]> {
  const modules: ModuleDef[] = [];
  for (const dir of readdirSync(MODULES_DIR)) {
    const generated = join(MODULES_DIR, dir, "src/_generated.ts");
    if (!existsSync(generated)) continue;
    const mod = await import(generated);
    modules.push({
      name: dir,
      commands: mod.commands ?? {},
      helpers: mod.helpers ?? {},
    });
  }
  return buildReferenceEntries(sortModules(modules), async () => "");
}
