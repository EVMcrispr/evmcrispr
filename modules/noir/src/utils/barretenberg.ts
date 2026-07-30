/**
 * Barretenberg (UltraHonk) plumbing for the noir module: lazy loading of
 * the (heavy) bb.js bundle, a shared wasm API instance, and per-circuit
 * backend/vkey/verifier caches so the verifier a script deploys and the
 * proofs it generates are guaranteed consistent within a session.
 *
 * bb.js downloads its SRS points (Aztec's ignition CRS) from
 * crs.aztec-labs.com on first proof and caches them (on disk under
 * node/bun, in memory in the browser).
 */

import type {
  Barretenberg,
  UltraHonkBackend,
  UltraHonkBackendOptions,
} from "@aztec/bb.js";
import { ErrorException, type FetchContext } from "@evmcrispr/sdk";
import { bytesToHex, hexToBytes } from "viem";
import type { NoirProgramArtifact } from "./noir";

/**
 * Proof transcript hash: `keccak` proofs are what the generated Solidity
 * verifier accepts (bb.js `verifierTarget: "evm"`); `poseidon` is bb's
 * native transcript — cheaper to prove, off-chain/recursive use only.
 */
export type Oracle = "keccak" | "poseidon";

export const ORACLES: Oracle[] = ["keccak", "poseidon"];

/** Parse an `--oracle` / `oracle:` value. */
export function parseOracleValue(value: string): Oracle {
  if ((ORACLES as string[]).includes(value)) return value as Oracle;
  throw new ErrorException(
    `@noir: unknown oracle "${value}" — supported: ${ORACLES.join(", ")}`,
  );
}

/** Resolve an optional `oracle:` named arg (undefined → keccak). */
export function buildOracle(value: unknown): Oracle {
  return value === undefined ? "keccak" : parseOracleValue(String(value));
}

function backendOptions(oracle: Oracle): UltraHonkBackendOptions | undefined {
  return oracle === "keccak" ? { verifierTarget: "evm" } : undefined;
}

type BbJs = typeof import("@aztec/bb.js");

let bbPromise: Promise<BbJs> | undefined;

/** Load bb.js on first use — it must never load with the module. */
function loadBb(): Promise<BbJs> {
  if (!bbPromise) {
    bbPromise = import("@aztec/bb.js") as Promise<BbJs>;
    bbPromise.catch(() => {
      bbPromise = undefined;
    });
  }
  return bbPromise;
}

let apiPromise: Promise<Barretenberg> | undefined;

/**
 * The shared Barretenberg wasm instance. bb.js's worker-thread pool is
 * unreliable under bun/node CLI contexts (snarkjs precedent), so run
 * single-threaded there; the browser keeps the multi-threaded pool.
 */
function getApi(): Promise<Barretenberg> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const bb = await loadBb();
      const isNode = typeof process !== "undefined" && !!process.versions?.node;
      return bb.Barretenberg.new(isNode ? { threads: 1 } : {});
    })();
    apiPromise.catch(() => {
      apiPromise = undefined;
    });
  }
  return apiPromise;
}

const backendCache = new Map<string, Promise<UltraHonkBackend>>();

function getBackend(
  compileKey: string,
  bytecode: string,
): Promise<UltraHonkBackend> {
  let cached = backendCache.get(compileKey);
  if (!cached) {
    cached = (async () => {
      const [bb, api] = await Promise.all([loadBb(), getApi()]);
      return new bb.UltraHonkBackend(bytecode, api);
    })();
    backendCache.set(compileKey, cached);
    cached.catch(() => backendCache.delete(compileKey));
  }
  return cached;
}

const vkeyCache = new Map<string, Promise<Uint8Array>>();

export function getVkey(
  compileKey: string,
  program: NoirProgramArtifact,
  oracle: Oracle,
  ctx: FetchContext,
): Promise<Uint8Array> {
  const key = `${compileKey}\0${oracle}`;
  let cached = vkeyCache.get(key);
  if (!cached) {
    cached = (async () => {
      const backend = await getBackend(compileKey, program.bytecode);
      ctx.log?.(`@noir: computing the ${oracle} verification key…`);
      return backend.getVerificationKey(backendOptions(oracle));
    })();
    vkeyCache.set(key, cached);
    cached.catch(() => vkeyCache.delete(key));
  }
  return cached;
}

const verifierCache = new Map<string, Promise<string>>();

/** Solidity HonkVerifier source — always the keccak (EVM) transcript. */
export function getVerifierSource(
  compileKey: string,
  program: NoirProgramArtifact,
  ctx: FetchContext,
): Promise<string> {
  let cached = verifierCache.get(compileKey);
  if (!cached) {
    cached = (async () => {
      const backend = await getBackend(compileKey, program.bytecode);
      const vk = await getVkey(compileKey, program, "keccak", ctx);
      ctx.log?.("@noir: generating the Solidity verifier…");
      return backend.getSolidityVerifier(vk, backendOptions("keccak"));
    })();
    verifierCache.set(compileKey, cached);
    cached.catch(() => verifierCache.delete(compileKey));
  }
  return cached;
}

export interface UltraHonkProof {
  /** Proof bytes, 0x-hex. */
  proof: `0x${string}`;
  /** Public inputs as 0x-hex bytes32 strings (verifier calldata order). */
  publicInputs: `0x${string}`[];
  oracle: Oracle;
}

export async function proveUltraHonk(
  compileKey: string,
  program: NoirProgramArtifact,
  inputs: Record<string, unknown>,
  oracle: Oracle,
  ctx: FetchContext,
): Promise<UltraHonkProof> {
  const { Noir } = await import("@noir-lang/noir_js");
  const noir = new Noir(
    program as unknown as ConstructorParameters<typeof Noir>[0],
  );
  ctx.log?.("noir:prove: executing the circuit…");
  let witness: Uint8Array;
  try {
    ({ witness } = await noir.execute(
      inputs as Parameters<InstanceType<typeof Noir>["execute"]>[0],
    ));
  } catch (err) {
    throw new ErrorException(
      `noir:prove: circuit execution failed — ${(err as Error).message ?? err}`,
    );
  }
  const backend = await getBackend(compileKey, program.bytecode);
  ctx.log?.(
    `noir:prove: generating the ${oracle} UltraHonk proof (downloads SRS points on first use)…`,
  );
  const proofData = await backend.generateProof(
    witness,
    backendOptions(oracle),
  );
  return {
    proof: bytesToHex(proofData.proof),
    publicInputs: proofData.publicInputs.map((i) => i as `0x${string}`),
    oracle,
  };
}

export async function verifyUltraHonk(
  proof: UltraHonkProof,
  vkey: Uint8Array,
): Promise<boolean> {
  const [bb, api] = await Promise.all([loadBb(), getApi()]);
  const verifier = new bb.UltraHonkVerifierBackend(api);
  return verifier.verifyProof(
    {
      proof: hexToBytes(proof.proof),
      publicInputs: proof.publicInputs,
      verificationKey: vkey,
    },
    backendOptions(proof.oracle),
  );
}
