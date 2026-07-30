/**
 * snarkjs plumbing for `circom:prove`: lazy loading of the (heavy) snarkjs
 * bundle, artifact fetching over http(s)/ipfs with a session cache, and
 * the Groth16 fullProve call over in-memory artifacts (identical code
 * path in the browser and under bun).
 */
import {
  ErrorException,
  type FetchContext,
  Num,
  fetchArtifact as sdkFetchArtifact,
} from "@evmcrispr/sdk";

export type { FetchContext };

/** A snarkjs in-memory fastfile: pass `{type:"mem"}` and read `.data` back. */
export interface MemFile {
  type: "mem";
  data?: Uint8Array;
}

export type ProofSystem = "groth16" | "plonk" | "fflonk";

export interface FullProveResult {
  proof: Record<string, unknown>;
  publicSignals: string[];
}

interface Prover {
  fullProve(
    input: Record<string, unknown>,
    wasm: { type: "mem"; data: Uint8Array },
    zkey: { type: "mem"; data: Uint8Array },
  ): Promise<FullProveResult>;
  verify(
    vkey: Record<string, unknown>,
    publicSignals: unknown[],
    proof: Record<string, unknown>,
  ): Promise<boolean>;
  setup?(r1cs: MemFile, ptau: MemFile, out: MemFile): Promise<unknown>;
}

type Snarkjs = {
  groth16: Prover;
  plonk: Prover;
  fflonk: Prover;
  powersOfTau: {
    newAccumulator(curve: unknown, power: number, out: MemFile): Promise<void>;
    contribute(
      oldPtau: MemFile,
      newPtau: MemFile,
      name: string,
      entropy: string,
    ): Promise<unknown>;
    preparePhase2(oldPtau: MemFile, newPtau: MemFile): Promise<void>;
  };
  zKey: {
    newZKey(r1cs: MemFile, ptau: MemFile, out: MemFile): Promise<unknown>;
    contribute(
      oldZkey: MemFile,
      newZkey: MemFile,
      name: string,
      entropy: string,
    ): Promise<unknown>;
    exportSolidityVerifier(
      zkey: MemFile,
      templates: Partial<Record<ProofSystem, string>>,
    ): Promise<string>;
    exportVerificationKey(zkey: MemFile): Promise<Record<string, unknown>>;
  };
  curves: {
    getCurveFromName(
      name: string,
      options?: { singleThread?: boolean },
    ): Promise<unknown>;
  };
};

let snarkjsPromise: Promise<Snarkjs> | undefined;

/** Load snarkjs on first use — it must never load with the module. */
export function loadSnarkjs(): Promise<Snarkjs> {
  if (!snarkjsPromise) {
    snarkjsPromise = importSnarkjs();
    snarkjsPromise.catch(() => {
      snarkjsPromise = undefined;
    });
  }
  return snarkjsPromise;
}

/** The bn128 curve object snarkjs internals will reuse (see preseed below). */
export async function getBn128(): Promise<unknown> {
  const snarkjs = await loadSnarkjs();
  const cached = (globalThis as Record<string, unknown>).curve_bn128;
  if (cached) return cached;
  return snarkjs.curves.getCurveFromName("bn128");
}

async function importSnarkjs(): Promise<Snarkjs> {
  const snarkjs = (await import("snarkjs")) as Snarkjs;
  // ffjavascript's worker-thread pool crashes under bun/node workers-in-CLI
  // contexts; pre-seed its global curve cache with a single-threaded build
  // so every snarkjs-internal buildBn128() call reuses it. The browser
  // keeps the (working) multi-threaded pool.
  if (
    typeof process !== "undefined" &&
    process.versions?.node &&
    !(globalThis as Record<string, unknown>).curve_bn128
  ) {
    (globalThis as Record<string, unknown>).curve_bn128 =
      await snarkjs.curves.getCurveFromName("bn128", { singleThread: true });
  }
  return snarkjs;
}

/** Session-cached artifact fetch with `circom:prove:`-prefixed errors. */
export function fetchArtifact(
  url: string,
  what: string,
  ctx: FetchContext,
): Promise<Uint8Array> {
  return sdkFetchArtifact(url, what, { ...ctx, errorPrefix: "circom:prove: " });
}

/**
 * Parse the `--inputs` option into the named-signal map snarkjs expects.
 * Primary form is an EVML entries array `[[a 3] [b 11]]` (values may nest
 * for array signals); a JSON object string is also accepted for interop
 * with snarkjs `input.json` files (pasted or fetched).
 */
export function parseProveInputs(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ErrorException(
        `circom:prove: --inputs must be an entries array like [[a 3] [b 11]] or a JSON object string, got ${value}`,
      );
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new ErrorException(
        `circom:prove: --inputs JSON must be an object of circuit signals, got ${value}`,
      );
    }
    return parsed as Record<string, unknown>;
  }
  if (!Array.isArray(value)) {
    throw new ErrorException(
      "circom:prove: --inputs must be an entries array like [[a 3] [b 11]] or a JSON object string",
    );
  }
  const inputs: Record<string, unknown> = {};
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new ErrorException(
        `circom:prove: --inputs entries must be [name value] pairs, got ${JSON.stringify(entry)}`,
      );
    }
    const [name, signal] = entry;
    if (typeof name !== "string" || name === "") {
      throw new ErrorException(
        `circom:prove: --inputs signal names must be strings, got ${name}`,
      );
    }
    if (inputs[name] !== undefined) {
      throw new ErrorException(
        `circom:prove: --inputs has a duplicate signal "${name}"`,
      );
    }
    inputs[name] = toSignalValue(signal, name);
  }
  return inputs;
}

function toSignalValue(value: unknown, name: string): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => toSignalValue(v, name));
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new ErrorException(
        `circom:prove: --inputs signal "${name}" has an unsupported value: ${value}`,
      );
    }
    return String(value);
  }
  if (typeof value === "string") {
    // snarkjs expects decimal; convert hex strings up front.
    return /^0x[0-9a-fA-F]+$/.test(value) ? BigInt(value).toString() : value;
  }
  try {
    const num = Num(value);
    if (!num.isInteger()) throw new Error("non-integer");
    return num.toBigInt().toString();
  } catch {
    throw new ErrorException(
      `circom:prove: --inputs signal "${name}" has an unsupported value: ${value}`,
    );
  }
}

export async function fullProve(
  system: ProofSystem,
  inputs: Record<string, unknown>,
  wasm: Uint8Array,
  zkey: Uint8Array,
): Promise<FullProveResult> {
  const snarkjs = await loadSnarkjs();
  return snarkjs[system].fullProve(
    inputs,
    { type: "mem", data: wasm },
    { type: "mem", data: zkey },
  );
}

export async function verifyProof(
  system: ProofSystem,
  vkey: Record<string, unknown>,
  publicSignals: unknown[],
  proof: Record<string, unknown>,
): Promise<boolean> {
  const snarkjs = await loadSnarkjs();
  return snarkjs[system].verify(vkey, publicSignals, proof);
}
