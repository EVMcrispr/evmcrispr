// Named import: the package's default export is the module object
// ({ Buffer, SlowBuffer, ... }), not the Buffer class, and consumers call
// e.g. window.Buffer.isBuffer directly.
import { Buffer } from "buffer";

declare global {
  interface Window {
    Buffer: any;
  }
}

// polyfill Buffer for client
if (!window.Buffer) {
  window.Buffer = Buffer;
}
