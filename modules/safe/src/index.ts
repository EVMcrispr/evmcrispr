import type { Address, ModuleContext } from "@evmcrispr/sdk";
import { defineModule } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
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
   *  enclosing `safe:propose` / `safe:execute` block, if any, and whether
   *  a `safe:upgrade` earlier in that block will move it to v1.5.0. */
  #safeStack: { safe: Address; upgraded: boolean }[];
  constructor(context: ModuleContext) {
    super(context);

    this.#safeStack = [];
  }

  get currentSafe(): Address | undefined {
    return this.#safeStack.at(-1)?.safe;
  }

  pushSafe(safe: Address): void {
    this.#safeStack.push({ safe, upgraded: false });
  }

  popSafe(): void {
    this.#safeStack.pop();
  }

  /** Record that the enclosing block upgrades its Safe to v1.5.0. The
   *  block's actions are only collected, so on-chain reads still see the
   *  old version until the block runs; the record ends with the block. */
  markUpgraded(): void {
    const top = this.#safeStack.at(-1);
    if (top) top.upgraded = true;
  }

  /** Whether an enclosing block upgrades `safe` before its later actions. */
  upgradePending(safe: Address): boolean {
    return this.#safeStack.some(
      (frame) => frame.upgraded && isAddressEqual(frame.safe, safe),
    );
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
