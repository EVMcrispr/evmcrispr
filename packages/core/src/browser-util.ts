/**
 * Browser-compatible replacement for arcsecond's unreachable `util` fallback.
 * Every browser EVMcrispr supports has native UTF-8 codecs.
 */
export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;
