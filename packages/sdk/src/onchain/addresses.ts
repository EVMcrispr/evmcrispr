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
  "0xf601f42D6752dB5423efE6e5c16044d275F06aC2";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0xe3F9CCD4f6A11a044533055B9581765EB845AbB3";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0x9647762c87a5Ff7a378c4a4752D23b88E5302e3B";

/** Canonical address of Expressions (CREATE2): the runtime composition
 *  engine (`resolveCall`, `resolveValues`, `evaluate`); named
 *  ExpressionResolver before the contracts repo renamed it. */
export const EXPRESSION_RESOLVER_ADDRESS =
  "0xb3cC9B9821b990B7c7EAe4934555d04c273Ce487" as const;
