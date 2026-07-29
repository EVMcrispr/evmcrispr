/* tslint:disable */
/* eslint-disable */

/**
 * Long-lived per-chain fork holding an in-memory `CacheDB`. Fallible methods
 * return a tagged JSON envelope string: `ok` / `value` / `success` / `revert`
 * / `halt` / `misses` / `error` — see `exec.rs`. The TS wrapper resolves
 * `misses` over JSON-RPC, seeds the cache via `insert*`, and retries.
 */
export class RevmFork {
    free(): void;
    [Symbol.dispose](): void;
    blockNumber(): bigint;
    call(tx_json: string): string;
    getBalance(addr: string): string;
    getCode(addr: string): string;
    getStorage(addr: string, slot: string): string;
    increaseTime(seconds: bigint): void;
    insertAccount(addr: string, balance: string, nonce: bigint, code: string): string;
    insertBlockHash(number: bigint, hash: string): string;
    insertStorage(addr: string, slot: string, value: string): string;
    mine(blocks: bigint): void;
    constructor(chain_id: bigint, block_number: bigint, base_timestamp: bigint);
    setBalance(addr: string, balance: string): string;
    setCode(addr: string, code: string): string;
    setStorage(addr: string, slot: string, value: string): string;
    transact(tx_json: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_revmfork_free: (a: number, b: number) => void;
    readonly revmfork_blockNumber: (a: number) => bigint;
    readonly revmfork_call: (a: number, b: number, c: number, d: number) => void;
    readonly revmfork_getBalance: (a: number, b: number, c: number, d: number) => void;
    readonly revmfork_getCode: (a: number, b: number, c: number, d: number) => void;
    readonly revmfork_getStorage: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly revmfork_increaseTime: (a: number, b: bigint) => void;
    readonly revmfork_insertAccount: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number) => void;
    readonly revmfork_insertBlockHash: (a: number, b: number, c: bigint, d: number, e: number) => void;
    readonly revmfork_insertStorage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly revmfork_mine: (a: number, b: bigint) => void;
    readonly revmfork_new: (a: bigint, b: bigint, c: bigint) => number;
    readonly revmfork_setBalance: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly revmfork_setCode: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly revmfork_setStorage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly revmfork_transact: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
