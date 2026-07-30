// The feross/buffer browser polyfill (the trailing slash resolves the npm
// package rather than the node builtin in bundlers and bun alike).
declare module "buffer/" {
  export const Buffer: unknown;
}
