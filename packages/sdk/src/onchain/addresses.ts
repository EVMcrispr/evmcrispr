import type { Address } from "../types";

/**
 * The four contract addresses compiled on-chain expressions target. Each is
 * predicted from deterministic CREATE2 inputs, identical on compatible chains.
 * These constants do not establish that code is deployed: check the selected
 * chain before use. A test fork installs matching runtime at these addresses
 * (see `installAssertionsCore` in
 * `@evmcrispr/test-utils`), which keeps compiled calldata byte-identical to
 * what production emits.
 *
 * These move whenever a contract's bytecode does, comments included. They are
 * generated from the contracts repo's `website/src/lib/deployments.json`; keep
 * them in step with it and with the runtime fixture in
 * `@evmcrispr/test-utils/onchain/assertions-bytecode`.
 */

/** Canonical address of the Assertions core (CREATE2). */
export const CORE_ADDRESS: Address =
  "0xA55e4722883831c97d20E4Cb26E9a3C8569D9F6e";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x09e4A7eb757a41c78e2c1E810a2B162683AD903e";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xc011Ec76C3f40945184b93F79377Bca9662165d5";

/** Canonical address of Expressions (CREATE2): typed expression graphs
 *  (`evaluate`), the host of collection callbacks compiled as graphs.
 *  Resolve-once call construction is the core's (`get`, `gather`). */
export const EXPRESSIONS_ADDRESS: Address =
  "0xe5594e5554FaF731C4ce9DE8b4Ea078CB52B62F2";
