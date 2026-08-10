/**
 * `@evmcrispr/sdk/onchain` — the shared on-chain expression layer.
 *
 * ERC-8211 wire encoding, the assertions core + Operators calldata
 * builders, the composition table, the expression compiler and the
 * cross-module `!` helper dispatch. Any module can import this subpath to
 * give its helpers an on-chain (`compile`) face.
 */
export * from "./addresses";
export * from "./arrays";
export * from "./assert";
export * from "./compile";
export * from "./composition";
export * from "./construct";
export * from "./core";
export * from "./defs";
export * from "./dispatch";
export * from "./erc8211";
export * from "./judge";
export * from "./lambda";
export * from "./operators";
export * from "./reads";
export * from "./recipes";
export * from "./types";
