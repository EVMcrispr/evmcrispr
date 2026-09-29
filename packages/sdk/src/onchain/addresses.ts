import type { Address } from "../types";

/**
 * The four contract addresses compiled on-chain expressions target. Each is
 * predicted from deterministic CREATE2 inputs, identical on compatible chains.
 * These constants do not establish that code is deployed: check the selected
 * chain before use. A test fork installs the matching runtime at these addresses (see `installAssertionsCore` in
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
  "0xa55e471dAbab283FE62C7fD7D8bF36Eec61D9B17";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x09E4A7E2bc38966F02e994D3ecA5552d8B4528a2";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xc011eC7A827F5f680668F0d2ff6B1b675338923A";

/** Canonical address of Expressions (CREATE2): typed expression graphs
 *  (`evaluate`), the host of collection callbacks compiled as graphs.
 *  Resolve-once call construction is the core's (`get`, `gather`). */
export const EXPRESSIONS_ADDRESS: Address =
  "0xE5594E55C97afAA1d218113AA21Ceb1625e30da0";
