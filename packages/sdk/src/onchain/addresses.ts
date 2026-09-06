import type { Address } from "../types";

/**
 * The core and periphery addresses used by compiled on-chain expressions.
 * Both are deployed at deterministic CREATE2 addresses, identical on every
 * chain, so there is nothing to configure: a fork that wants different code
 * at these addresses installs it there (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 */

/** Canonical address of the Assertions core v2.0 (vanity CREATE2 salt). */
export const CORE_ADDRESS: Address =
  "0x4D710b5AaBcd7f8753307c71779904A562422A15";

/** Canonical address of the Operations v1.0 (retained CREATE2 salt). */
export const OPERATIONS_ADDRESS: Address =
  "0xbe58Ca28d8FC1395F94E9871cB8A15f3D2Bd2f60";

/** Generic ABI-valued collection periphery (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xd19bdD4a5462080F40B795c50d98827812B2C56b";

export const EXPRESSION_RESOLVER_ADDRESS =
  "0x255e580C85133DCECe94B67DaA21036Ed3C08997" as const;
