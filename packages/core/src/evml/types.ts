import type { IModuleConstructor } from "@evmcrispr/sdk";
import type { Address, Transport } from "viem";

/**
 * Environment configuration shared by the `evml` tag, the interpreter and
 * the editor workspace. Everything here is known *before* a script exists;
 * per-run options (wallet client, abort signal, ...) live on the method
 * arguments instead.
 */
export interface EvmlConfig {
  /** Sender account used by commands that need a connected account. */
  account?: Address;
  /** The account calls are sent from when it is not the connected one
   *  (what `@sender` resolves to); defaults to `account`. */
  sender?: Address;
  /** Initial chain id. Defaults to mainnet. */
  chainId?: number;
  /** Per-chain viem transports. Chains without an entry fall back to
   *  viem's default `http()` transport. */
  transports?: Record<number, Transport>;
  /** Log listener, invoked for every `print`/module log message. */
  onLog?: (message: string, prevMessages: string[]) => void;
  /** Line listener, invoked as the interpreter advances through the
   *  script (`null` when the run finishes). */
  onLine?: (line: number | null) => void;
}

export type ModuleLoader = () => Promise<{ default: IModuleConstructor }>;

/**
 * Accepted inputs of `evml.use(...)`: an eagerly imported module class
 * (its `moduleName` static provides the registration name) or a lazy
 * loader entry, which keeps code-splitting in bundled apps.
 */
export type ModuleInput =
  | IModuleConstructor
  | {
      name: string;
      load: ModuleLoader;
      description?: string;
      /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
      experimental?: boolean;
    };
