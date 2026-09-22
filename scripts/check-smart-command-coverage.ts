/** Every command must have an explicit atomic/runtime classification. */
import { readdir } from "node:fs/promises";
import inventory from "./smart-command-inventory.json";

const seen = new Set<string>();
for (const module of await readdir(new URL("../modules", import.meta.url))) {
  const dir = new URL(`../modules/${module}/src/commands/`, import.meta.url);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }
  for (const file of files.filter(
    (name) => name.endsWith(".ts") && !name.startsWith("_"),
  )) {
    const name = `${module}/${file.slice(0, -3)}`;
    seen.add(name);
    const entry = inventory[name as keyof typeof inventory];
    if (!entry)
      throw new Error(`Classify ${name} in smart-command-inventory.json`);
    const { default: command } = await import(new URL(file, dir).href);
    if (command.smartSupport?.kind !== entry.kind)
      throw new Error(`${name}: inventory does not match command metadata`);
    if (entry.kind !== "runtime" && !command.smartSupport.reason)
      throw new Error(
        `${name}: static/incompatible commands require a concrete reason`,
      );
    if (
      entry.kind === "runtime" &&
      !command.compile &&
      ![...command.argDefs, ...command.optDefs].some((field) => field.runtime)
    )
      throw new Error(
        `${name}: runtime classification has no compiler or runtime fields`,
      );
  }
}
for (const name of Object.keys(inventory))
  if (!seen.has(name))
    throw new Error(`Remove stale smart command inventory entry ${name}`);
console.log(`Smart-batch classifications verified for ${seen.size} commands.`);

const { VENUES } = await import("../modules/swaps/src/venues/registry");
const { ADAPTERS: lending } = await import(
  "../modules/lending/src/adapters/registry"
);
const { ADAPTERS: bridges } = await import(
  "../modules/bridges/src/adapters/registry"
);
const { ADAPTERS: governance } = await import(
  "../modules/aragonosx/src/plugins/registry"
);
const { default: adapterInventory } = await import(
  "./smart-adapter-inventory.json"
);
const adapters = [
  ...Object.values(VENUES).map((a) => `swaps/${a.name}`),
  ...Object.values(lending).map((a) => `lending/${a.name}`),
  ...Object.values(bridges).map((a) => `bridges/${a.name}`),
  ...governance.map((a) => `aragonosx/${a.id}`),
];
for (const name of adapters) {
  const entry = adapterInventory[name as keyof typeof adapterInventory];
  if (!entry)
    throw new Error(`Classify adapter ${name} in smart-adapter-inventory.json`);
  if (entry.kind !== "runtime" && !("reason" in entry))
    throw new Error(`${name} requires a concrete restriction`);
  if (!(await Bun.file(new URL(`../${entry.tests}`, import.meta.url)).exists()))
    throw new Error(`${name} lacks its declared smart-batch tests`);
}
for (const name of Object.keys(adapterInventory))
  if (!adapters.includes(name)) throw new Error(`Remove stale adapter ${name}`);
console.log(
  `Smart-batch classifications verified for ${adapters.length} adapters.`,
);
