import type { Address } from "../types";

/**
 * The two contracts every compiled on-chain expression is built against.
 * Both are deployed at deterministic CREATE2 addresses, identical on every
 * chain, so there is nothing to configure: a fork that wants different code
 * at these addresses installs it there (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 */

/** Canonical address of the Assertions core v2.0 (vanity CREATE2 salt). */
export const CORE_ADDRESS: Address =
  "0xA55E472841ca3D318205036724A94F5abDbf7b18";

/** Canonical address of the Operators v1.0 (vanity CREATE2 salt). */
export const OPERATORS_ADDRESS: Address =
  "0x09e4a7e55200600314165ddFB381639dace41bEA";
