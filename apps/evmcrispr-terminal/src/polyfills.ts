import Buffer from "buffer";

declare global {
  interface Window {
    Buffer: any;
  }
}

// polyfill Buffer for client
if (!window.Buffer) {
  window.Buffer = Buffer;
}
