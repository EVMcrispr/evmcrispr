/**
 * Word-array argument plumbing of the lang on-chain faces — now shared
 * across modules from `@evmcrispr/sdk/onchain` (the crypto merkle face
 * folds the same payloads); re-exported here for the lang helpers.
 */
export {
  type CallArrayArg,
  constWordsPayload,
  wordArrayPath,
  wordsArg,
  wordsPayload,
} from "@evmcrispr/sdk/onchain";
