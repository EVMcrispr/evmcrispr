import { BindingsSpace, defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Circom from "..";
import { compileCircomCached } from "../utils/circom";
import { parseZkeyProtocol } from "../utils/proof";
import { parsePtauValue, parseSystemValue, setupCached } from "../utils/setup";
import {
  fetchArtifact,
  fullProve,
  type ProofSystem,
  parseProveInputs,
} from "../utils/snarkjs";

export default defineCommand<Circom>({
  name: "prove",
  description:
    "Generate a proof with snarkjs (groth16, plonk or fflonk) and bind the result (proof + public signals, as JSON) to <variable>. Prove from pre-built artifacts (--wasm/--zkey, system auto-detected from the zkey) or compile a circuit in-place (--circom; groth16 setups are DEV-ONLY, plonk/fflonk are deterministic). Read the verifier-call arguments back with @circom:proof.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the proof JSON string to",
    },
  ],
  opts: [
    {
      name: "wasm",
      type: "string",
      description: "URL (http(s):// or ipfs://) of the compiled circuit WASM",
    },
    {
      name: "zkey",
      type: "string",
      description:
        "URL (http(s):// or ipfs://) of the final Groth16 proving key (.zkey)",
    },
    {
      name: "circom",
      type: "string",
      description:
        "circom source (or URL) to compile and set up in-place instead of --wasm/--zkey — DEV-ONLY trusted setup, never for production proofs",
    },
    {
      name: "ptau",
      type: "string",
      description:
        "Powers-of-tau for the in-place setup: dev (generate locally) or a ptau URL (default: auto-download a hez file sized to the circuit); only valid with --circom",
    },
    {
      name: "system",
      type: "string",
      description:
        "Proof system for the in-place setup: groth16 (default, DEV-ONLY), plonk or fflonk (deterministic); only valid with --circom (pre-built zkeys carry their system)",
    },
    {
      name: "inputs",
      type: ["record", "string"],
      description:
        "Circuit input signals: a record like [a:3 b:11] (equivalently [[a 3] [b 11]]; nest values for array signals), or a JSON object string",
    },
  ],
  async run(module, { variable }, { opts }) {
    if (opts.circom !== undefined) {
      if (opts.wasm !== undefined || opts.zkey !== undefined) {
        throw new ErrorException(
          "circom:prove: --circom is mutually exclusive with --wasm/--zkey — it compiles and sets up the circuit in-place",
        );
      }
    } else {
      if (opts.ptau !== undefined) {
        throw new ErrorException("circom:prove: --ptau requires --circom");
      }
      if (opts.system !== undefined) {
        throw new ErrorException(
          "circom:prove: --system requires --circom — pre-built zkeys carry their proof system",
        );
      }
      const missing = ["wasm", "zkey"].filter(
        (name) => opts[name] === undefined,
      );
      if (missing.length) {
        throw new ErrorException(
          `circom:prove: ${missing.map((name) => `--${name}`).join(", ")} ${missing.length > 1 ? "are" : "is"} required (or use --circom)`,
        );
      }
    }
    if (opts.inputs === undefined) {
      throw new ErrorException("circom:prove: --inputs is required");
    }
    const inputs = parseProveInputs(opts.inputs);

    const checkAborted = () => {
      if (module.context.signal?.aborted) {
        throw new ErrorException("circom:prove: aborted");
      }
    };
    const ctx = {
      log: (message: string) => module.context.log(message),
      fetchIpfs: (cidPath: string) => module.ipfsResolver.bytes(cidPath),
    };

    checkAborted();
    let wasm: Uint8Array;
    let zkey: Uint8Array;
    let system: ProofSystem;
    if (opts.circom !== undefined) {
      const ptau = parsePtauValue(opts.ptau) ?? { kind: "auto" as const };
      if (opts.ptau !== undefined && ptau.kind === "auto") {
        throw new ErrorException(
          `circom:prove: --ptau must be "dev" or a http(s)/ipfs URL, got ${opts.ptau}`,
        );
      }
      system =
        opts.system !== undefined
          ? parseSystemValue(String(opts.system))
          : "groth16";
      const source = String(opts.circom);
      const [compiled, setup] = await Promise.all([
        compileCircomCached(source, ctx),
        setupCached(source, { ptau, system }, ctx),
      ]);
      wasm = compiled.wasm;
      zkey = setup.zkey;
    } else {
      module.context.log("circom:prove: fetching circuit artifacts…");
      [wasm, zkey] = await Promise.all([
        fetchArtifact(opts.wasm, "wasm", ctx),
        fetchArtifact(opts.zkey, "zkey", ctx),
      ]);
      system = parseZkeyProtocol(zkey);
    }

    checkAborted();
    module.context.log(
      "circom:prove: generating proof… (this can take a while for large circuits)",
    );
    let proof: Record<string, unknown>;
    let publicSignals: string[];
    try {
      ({ proof, publicSignals } = await fullProve(system, inputs, wasm, zkey));
    } catch (err) {
      throw new ErrorException(
        `circom:prove: proving failed — ${(err as Error).message ?? err}`,
      );
    }

    checkAborted();
    module.bindingsManager.setBinding(
      variable,
      JSON.stringify({ proof, publicSignals }),
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    module.context.log(
      `:success: circom:prove: proof generated (${publicSignals.length} public signal(s))`,
    );

    return [];
  },
});
