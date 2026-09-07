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
  "0x94b07F5364b54471b065Ee74150864628Df722d7";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x314e75BEFDb0f3e0621f68458f98Fce75246f7a7";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0x830a490449eC148CE4404e398eC7FA9903Ce5Bc2";

/** Canonical address of Expressions (CREATE2): the runtime composition
 *  engine (`resolveCall`, `resolveValues`, `evaluate`); named
 *  ExpressionResolver before the contracts repo renamed it. */
export const EXPRESSION_RESOLVER_ADDRESS =
  "0x03B82019Ed1802172606922e8F8c8d43d0cd6d12" as const;
