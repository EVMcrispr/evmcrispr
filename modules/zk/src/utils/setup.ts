/**
 * In-place trusted setups for `@zk:circom.*` and `zk:prove --circom`.
 *
 * groth16 setups are DEV-ONLY: the circuit-specific phase 2 runs on the
 * spot with no ceremony, so anyone can reproduce it and forge proofs —
 * every groth16 entry point logs that warning. plonk/fflonk setups are
 * deterministic (no circuit-specific ceremony exists to fake): their
 * security reduces to the powers-of-tau alone, so with a real ptau (the
 * auto-downloaded Hermez files, ideally integrity-pinned) they are
 * production-grade.
 *
 * The powers-of-tau either comes from the public Hermez ceremony files
 * (auto-sized to the circuit, downloaded on first use), a caller URL, or
 * is generated locally (`ptau:dev`, small circuits only — dev-only for
 * every system, since a local ptau is itself unceremonied).
 *
 * The setup cache is keyed by (compileKey, ptau spec, system), so the
 * verifier a script deploys and the zkey the same script proves with are
 * guaranteed to match within a session.
 */
import { ErrorException } from "@evmcrispr/sdk";
import { compileCircomCached } from "./circom";
import { parseZkeyProtocol } from "./proof";
import {
  type FetchContext,
  fetchArtifact,
  getBn128,
  loadSnarkjs,
  type MemFile,
  type ProofSystem,
} from "./snarkjs";
import {
  FFLONK_VERIFIER_TEMPLATE,
  GROTH16_VERIFIER_TEMPLATE,
  PLONK_VERIFIER_TEMPLATE,
} from "./verifier-template";

export type PtauSpec =
  | { kind: "dev" }
  | { kind: "url"; url: string }
  | { kind: "auto" };

export interface SetupOptions {
  ptau: PtauSpec;
  system: ProofSystem;
}

/** Cap for locally generated ptau (preparePhase2 gets slow beyond this). */
export const DEV_PTAU_MAX_POWER = 12;
/** Cap for auto-downloaded hez ptau (larger files are unreasonable in-browser). */
export const AUTO_PTAU_MAX_POWER = 16;

const PROOF_SYSTEMS: ProofSystem[] = ["groth16", "plonk", "fflonk"];

const HEZ_PTAU_BASE = "https://storage.googleapis.com/zkevm/ptau";

export function hezPtauUrl(power: number): string {
  return `${HEZ_PTAU_BASE}/powersOfTau28_hez_final_${String(power).padStart(2, "0")}.ptau`;
}

/**
 * Parse `'ptau:...'` / `'system:...'` rest options (helpers) — same specs
 * as the `--ptau` / `--system` command opts.
 */
export function parseCircomSetupOptions(rest: string[]): SetupOptions {
  const options: SetupOptions = { ptau: { kind: "auto" }, system: "groth16" };
  for (const arg of rest) {
    if (arg.startsWith("system:")) {
      options.system = parseSystemValue(arg.slice("system:".length));
      continue;
    }
    const ptau = parsePtauValue(
      arg.startsWith("ptau:") ? arg.slice("ptau:".length) : undefined,
    );
    if (!ptau) {
      throw new ErrorException(
        `@zk:circom: unknown option "${arg}" — supported: ptau:dev, ptau:<url>, system:groth16|plonk|fflonk`,
      );
    }
    options.ptau = ptau;
  }
  return options;
}

/** Parse a `--ptau` value (`dev` or a URL); undefined → auto. */
export function parsePtauValue(
  value: string | undefined,
): PtauSpec | undefined {
  if (value === undefined) return undefined;
  if (value === "dev") return { kind: "dev" };
  if (/^(https?|ipfs):\/\//.test(value)) return { kind: "url", url: value };
  return undefined;
}

/** Parse a `--system` / `system:` value. */
export function parseSystemValue(value: string): ProofSystem {
  if ((PROOF_SYSTEMS as string[]).includes(value)) {
    return value as ProofSystem;
  }
  throw new ErrorException(
    `@zk:circom: unknown proof system "${value}" — supported: ${PROOF_SYSTEMS.join(", ")}`,
  );
}

/** Smallest power p with 2^p >= constraints, plus setup headroom. */
export function ptauPowerFor(constraints: number, minimum: number): number {
  return Math.max(minimum, Math.ceil(Math.log2(Math.max(constraints, 1))) + 1);
}

const devPtauCache = new Map<number, Promise<Uint8Array>>();

function devPtau(power: number, ctx: FetchContext): Promise<Uint8Array> {
  let cached = devPtauCache.get(power);
  if (!cached) {
    cached = devPtauFresh(power, ctx);
    devPtauCache.set(power, cached);
    cached.catch(() => devPtauCache.delete(power));
  }
  return cached;
}

async function devPtauFresh(
  power: number,
  ctx: FetchContext,
): Promise<Uint8Array> {
  const snarkjs = await loadSnarkjs();
  const curve = await getBn128();
  ctx.log?.(`zk setup: generating a local powers-of-tau (2^${power})…`);
  const ptau0: MemFile = { type: "mem" };
  const ptau1: MemFile = { type: "mem" };
  const ptauFinal: MemFile = { type: "mem" };
  await snarkjs.powersOfTau.newAccumulator(curve, power, ptau0);
  await snarkjs.powersOfTau.contribute(
    ptau0,
    ptau1,
    "evmcrispr dev setup",
    randomEntropy(),
  );
  await snarkjs.powersOfTau.preparePhase2(ptau1, ptauFinal);
  return ptauFinal.data as Uint8Array;
}

export async function getPtau(
  spec: PtauSpec,
  constraints: number,
  system: ProofSystem,
  ctx: FetchContext,
): Promise<Uint8Array> {
  if (spec.kind === "url") {
    return fetchArtifact(spec.url, "ptau", ctx);
  }
  if (spec.kind === "dev") {
    // plonk/fflonk pad tiny circuits into larger domains — below 2^4 the
    // snarkjs setup emits a malformed (untrimmed) zkey.
    const power = ptauPowerFor(constraints, system === "groth16" ? 2 : 4);
    if (power > DEV_PTAU_MAX_POWER) {
      throw new ErrorException(
        `@zk:circom: circuit too large for ptau:dev (${constraints} constraints needs a 2^${power} ptau, local cap is 2^${DEV_PTAU_MAX_POWER}) — pass ptau:<url> or omit the option to auto-download one`,
      );
    }
    return devPtau(power, ctx);
  }
  const power = ptauPowerFor(constraints, 8);
  if (power > AUTO_PTAU_MAX_POWER) {
    throw new ErrorException(
      `@zk:circom: circuit too large for an in-place setup (${constraints} constraints needs a 2^${power} ptau) — build the zkey offline and use --wasm/--zkey`,
    );
  }
  ctx.log?.(
    `zk setup: downloading powers-of-tau 2^${power} (${hezPtauUrl(power)}, can be tens of MB)…`,
  );
  return fetchArtifact(hezPtauUrl(power), "ptau", ctx);
}

function randomEntropy(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SetupResult {
  zkey: Uint8Array;
  verifierSource: string;
  /** Verification key JSON (zKey.exportVerificationKey), for @zk:verify. */
  vkeyJson: string;
}

const VERIFIER_TEMPLATES: Record<ProofSystem, string> = {
  groth16: GROTH16_VERIFIER_TEMPLATE,
  plonk: PLONK_VERIFIER_TEMPLATE,
  fflonk: FFLONK_VERIFIER_TEMPLATE,
};

const setupCache = new Map<string, Promise<SetupResult>>();

/**
 * Compile + set up a circuit, cached on (source, ptau spec, system). Both
 * `@zk:circom.*` and `zk:prove --circom` resolve through here.
 */
export function setupCached(
  sourceArg: string,
  options: SetupOptions,
  ctx: FetchContext,
): Promise<SetupResult> {
  const specString =
    options.ptau.kind === "url" ? options.ptau.url : options.ptau.kind;
  const doSetup = async (): Promise<SetupResult> => {
    const compiled = await compileCircomCached(sourceArg, ctx);
    const key = `${compiled.compileKey}\0${specString}\0${options.system}`;
    let cached = setupCache.get(key);
    if (!cached) {
      cached = setupFresh(compiled.r1cs, options, compiled.constraints, ctx);
      setupCache.set(key, cached);
      cached.catch(() => setupCache.delete(key));
    }
    return cached;
  };
  return doSetup();
}

async function setupFresh(
  r1cs: Uint8Array,
  options: SetupOptions,
  constraints: number,
  ctx: FetchContext,
): Promise<SetupResult> {
  const ptau = await getPtau(options.ptau, constraints, options.system, ctx);
  const snarkjs = await loadSnarkjs();
  const zkeyFinal: MemFile = { type: "mem" };

  if (options.system === "groth16") {
    ctx.log?.(
      ":warning: zk setup: DEV-ONLY groth16 setup — anyone can reproduce it and forge proofs; never guard real value with this verifier (plonk setups need no ceremony: system:plonk)",
    );
    ctx.log?.("zk setup: running the groth16 setup…");
    const zkey0: MemFile = { type: "mem" };
    await snarkjs.zKey.newZKey(
      { type: "mem", data: r1cs },
      { type: "mem", data: ptau },
      zkey0,
    );
    await snarkjs.zKey.contribute(
      zkey0,
      zkeyFinal,
      "evmcrispr dev setup",
      randomEntropy(),
    );
  } else {
    ctx.log?.(
      `zk setup: running the deterministic ${options.system} setup (security reduces to the powers-of-tau used${options.ptau.kind === "dev" ? " — a LOCAL dev ptau here, so this setup is still dev-only" : ""})…`,
    );
    const setup = snarkjs[options.system].setup;
    if (!setup) {
      throw new ErrorException(
        `@zk:circom: snarkjs has no ${options.system} setup`,
      );
    }
    try {
      await setup(
        { type: "mem", data: r1cs },
        { type: "mem", data: ptau },
        zkeyFinal,
      );
    } catch (err) {
      throw new ErrorException(
        `@zk:circom: ${options.system} setup failed — ${(err as Error).message ?? err}. ${options.system} domains can exceed the r1cs constraint count; try a larger ptau via ptau:<url>`,
      );
    }
  }

  // Sanity-check the produced zkey: an undersized ptau can make the
  // snarkjs setups emit malformed output instead of throwing.
  try {
    parseZkeyProtocol(zkeyFinal.data as Uint8Array);
  } catch {
    throw new ErrorException(
      `@zk:circom: the ${options.system} setup produced a malformed zkey — usually an undersized powers-of-tau; try a larger one via ptau:<url>`,
    );
  }

  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
  const verifierSource = await snarkjs.zKey.exportSolidityVerifier(zkeyFinal, {
    [options.system]: VERIFIER_TEMPLATES[options.system],
  });
  return {
    zkey: zkeyFinal.data as Uint8Array,
    verifierSource,
    vkeyJson: JSON.stringify(vkey),
  };
}
