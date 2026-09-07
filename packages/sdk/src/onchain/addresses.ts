import type { Address } from "../types";

/**
 * The core and periphery addresses used by compiled on-chain expressions.
 * Both are deployed at deterministic CREATE2 addresses, identical on every
 * chain, so there is nothing to configure: a fork that wants different code
 * at these addresses installs it there (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 */

/** Canonical address of the Assertions core (CREATE2). */
export const CORE_ADDRESS: Address =
  "0xA55E47Df0739353DFd7a914d65d935624F88A45d";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0xe3F9CCD4f6A11a044533055B9581765EB845AbB3";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xc011EC7840D287b6b7Ccbad6E8Ef7D7C8411Ca19";

/** Canonical address of Expressions (CREATE2): the runtime composition
 *  engine (`resolveCall`, `resolveValues`, `evaluate`); named
 *  ExpressionResolver before the contracts repo renamed it. */
export const EXPRESSION_RESOLVER_ADDRESS =
  "0xb3cC9B9821b990B7c7EAe4934555d04c273Ce487" as const;
