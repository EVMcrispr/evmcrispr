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
  "0xa55e47C835ACD377da79D57162117D9B5Ecf3496";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x09e4a7eF82674BaDD27a02E19f3D3e5a1903eA1f";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xc011ec7f6fAAaa37DE5923D2c6206C9597D16bc7";

/** Canonical address of Expressions (CREATE2): typed expression graphs
 *  (`evaluate`), the host of collection callbacks compiled as graphs.
 *  Resolve-once call construction is the core's (`get`, `gather`). */
export const EXPRESSIONS_ADDRESS: Address =
  "0xe5594e55aCa44ac271209612FA57866130edC9e5";
