/**
 * Canonical display order for EVMcrispr modules: core modules first in a
 * curated order, everything else alphabetical. Used by the module registry,
 * the terminal reference panel and the docs generator.
 */
export const CORE_MODULES = ["std", "lang", "sim", "http", "ens", "token"];

export function sortModuleNames(names: string[]): string[] {
  const rank = (name: string) => {
    const idx = CORE_MODULES.indexOf(name);
    return idx === -1 ? CORE_MODULES.length : idx;
  };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
