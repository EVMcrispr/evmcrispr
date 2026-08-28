import type { ChainDef } from "@evmcrispr/sdk";
import { isExperimentalEnabled, registerChains } from "@evmcrispr/sdk";
import type { ModuleLoader } from "./types";

/**
 * Instance-based module registry. Registration only makes a module
 * *available* — the `load <name>` command in a script still activates it.
 *
 * Experimental modules are always registered but hidden from `get`/`has`/
 * `names` unless `VITE_PUBLIC_EXPERIMENTAL` is enabled. The env is checked
 * at call time so one registry instance stays correct under either mode.
 */
export class ModuleRegistry {
  #loaders = new Map<string, ModuleLoader>();
  #descriptions = new Map<string, string>();
  #experimental = new Set<string>();

  register(
    name: string,
    loader: ModuleLoader,
    description?: string,
    experimental?: boolean,
    chains?: ChainDef[],
  ): void {
    // Eager on purpose: a script may `switch` to a module's chain before
    // (or without) loading the module.
    if (chains?.length) registerChains(...chains);
    this.#loaders.set(name, loader);
    if (description) this.#descriptions.set(name, description);
    if (experimental) this.#experimental.add(name);
    else this.#experimental.delete(name);
  }

  #hidden(name: string): boolean {
    return this.#experimental.has(name) && !isExperimentalEnabled();
  }

  get(name: string): ModuleLoader | undefined {
    return this.#hidden(name) ? undefined : this.#loaders.get(name);
  }

  has(name: string): boolean {
    return this.#loaders.has(name) && !this.#hidden(name);
  }

  /** Names visible in the current environment. */
  names(): string[] {
    return [...this.#loaders.keys()].filter((n) => !this.#hidden(n));
  }

  /** All registered names, including hidden experimental ones. */
  allNames(): string[] {
    return [...this.#loaders.keys()];
  }

  /** Registered names flagged as experimental (regardless of the env). */
  experimentalNames(): string[] {
    return [...this.#experimental];
  }

  isExperimental(name: string): boolean {
    return this.#experimental.has(name);
  }

  description(name: string): string | undefined {
    return this.#descriptions.get(name);
  }
}
