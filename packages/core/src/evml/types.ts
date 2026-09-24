import type { BoxSnapshot, ChainDef, IModuleConstructor } from "@evmcrispr/sdk";
import type { Address, Transport } from "viem";

/**
 * Environment configuration shared by the `evml` tag, the interpreter and
 * the editor workspace. Everything here is known *before* a script exists;
 * per-run options (wallet client, abort signal, ...) live on the method
 * arguments instead.
 */
export interface EvmlConfig {
  /** Explicit host input, exposed through @fetch(stdin:). No filesystem access. */
  stdin?: string;
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
  /** Log listener, invoked for every `print`/module log message. `meta.box`
   *  tags lines that belong to a status box. */
  onLog?: (
    message: string,
    prevMessages: string[],
    meta?: { box?: string },
  ) => void;
  /** Status box listener: a complete snapshot on every change. */
  onBox?: (snapshot: BoxSnapshot) => void;
  /** Wait for status boxes that hold the run (default true). False ends
   *  them as "Stopped following" when the script ends. */
  follow?: boolean;
  /** Printed text, without its terminating newline. When absent, `print`
   *  uses the log stream for backwards compatibility. */
  onOutput?: (message: string) => void;
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
      /** Chains the module ships (its `src/chains.ts`), registered on
       *  `use` so `switch <id>` works before the module is even loaded. */
      chains?: ChainDef[];
    };
