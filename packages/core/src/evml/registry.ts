import type { ModuleLoader } from "./types";

/**
 * Instance-based module registry. Registration only makes a module
 * *available* — the `load <name>` command in a script still activates it.
 */
export class ModuleRegistry {
  #loaders = new Map<string, ModuleLoader>();
  #descriptions = new Map<string, string>();

  register(name: string, loader: ModuleLoader, description?: string): void {
    this.#loaders.set(name, loader);
    if (description) this.#descriptions.set(name, description);
  }

  get(name: string): ModuleLoader | undefined {
    return this.#loaders.get(name);
  }

  has(name: string): boolean {
    return this.#loaders.has(name);
  }

  names(): string[] {
    return [...this.#loaders.keys()];
  }

  description(name: string): string | undefined {
    return this.#descriptions.get(name);
  }
}
