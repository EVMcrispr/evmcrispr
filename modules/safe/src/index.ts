import type { Address, ModuleContext } from "@evmcrispr/sdk";
import { defineModule } from "@evmcrispr/sdk";
import { commands, configs, helpers } from "./_generated";

export default class Safe extends defineModule(
  "safe",
  commands,
  helpers,
  undefined,
  undefined,
  configs,
) {
  /** Active nesting stack (push/pop). Tracks the Safe targeted by the
   *  enclosing `safe:propose` / `safe:execute` block, if any. */
  #safeStack: Address[];

  constructor(context: ModuleContext) {
    super(context);

    this.#safeStack = [];
  }

  get currentSafe(): Address | undefined {
    return this.#safeStack.at(-1);
  }

  pushSafe(safe: Address): void {
    this.#safeStack.push(safe);
  }

  popSafe(): void {
    this.#safeStack.pop();
  }

  /** Resolve the Safe an action or read targets: an explicit argument wins,
   *  then the enclosing propose/exec block's Safe, then the connected
   *  account (the Safe itself when running as a Safe App). */
  async resolveSafe(explicit?: Address): Promise<Address> {
    if (explicit) return explicit;
    if (this.currentSafe) return this.currentSafe;
    return this.getConnectedAccount(true);
  }
}
