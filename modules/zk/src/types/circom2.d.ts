// circom2 and @wasmer/wasmfs ship no type declarations; the narrow
// surfaces we use are typed here.
declare module "circom2" {
  export interface CircomBindings {
    fs: unknown;
    hrtime: () => number;
    exit: (code: number) => void;
    kill: (signal: string) => void;
    randomFillSync: (
      buf: Uint8Array,
      offset: number,
      size: number,
    ) => Uint8Array;
    isTTY: () => boolean;
    path: unknown;
  }
  export const bindings: CircomBindings;
  export class CircomRunner {
    constructor(options: {
      args: string[];
      env?: Record<string, string>;
      preopens?: Record<string, string>;
      bindings: CircomBindings;
    });
    execute(wasm: Uint8Array | Response | Promise<Response>): Promise<unknown>;
  }
}

declare module "@wasmer/wasmfs" {
  export class WasmFs {
    fs: {
      mkdirSync(path: string, options?: { recursive?: boolean }): void;
      writeFileSync(path: string, content: string | Uint8Array): void;
      readFileSync(path: string, encoding?: string): Uint8Array | string;
      readdirSync(path: string): string[];
      constants: Record<string, number>;
    };
  }
}
