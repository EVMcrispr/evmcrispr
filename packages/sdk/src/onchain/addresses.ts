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
  "0xa55e471cE89f66FaACF21E7E7cC22F2E9E2facab";

/** Canonical address of Operations (CREATE2): scalar computation over
 *  resolved values. */
export const OPERATIONS_ADDRESS: Address =
  "0x09e4a7E60e349232CC2B87296692F613eB216184";

/** Canonical address of Collections (CREATE2): iteration and the
 *  ABI-valued collection family (requires Cancun). */
export const COLLECTIONS_ADDRESS: Address =
  "0xC011Ec7d80189d7425976eC7B338e32129fc2E43";

/** Canonical address of Expressions (CREATE2): typed expression graphs
 *  (`evaluate`), the host of collection callbacks compiled as graphs.
 *  Resolve-once call construction is the core's (`get`, `gather`). */
export const EXPRESSIONS_ADDRESS: Address =
  "0xe5594e5561557B43ef3041F149C20A4cb849C64E";
