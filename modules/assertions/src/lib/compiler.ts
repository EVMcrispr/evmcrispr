/** Re-export shim — the on-chain expression compiler moved to
 *  `@evmcrispr/sdk/onchain` (kept so existing `lib/compiler` import paths
 *  keep resolving). `CompilerCtx` and `compileBangHelper` are the old
 *  names of `CompileCtx` and `compileOnchainHelper`. */

export type { CompileCtx as CompilerCtx } from "@evmcrispr/sdk/onchain";
export * from "@evmcrispr/sdk/onchain";
export { compileOnchainHelper as compileBangHelper } from "@evmcrispr/sdk/onchain";
