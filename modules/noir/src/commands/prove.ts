import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  fetchArtifact,
} from "@evmcrispr/sdk";
import type Noir from "..";
import {
  type Oracle,
  parseOracleValue,
  proveUltraHonk,
} from "../utils/barretenberg";
import { parseNoirInputs } from "../utils/inputs";
import {
  artifactCompileKey,
  compileNoirCached,
  type NoirProgramArtifact,
  parseArtifactJson,
} from "../utils/noir";

export default defineCommand<Noir>({
  name: "prove",
  description:
    "Generate an UltraHonk proof with Barretenberg and bind the result (proof + public inputs, as JSON) to <variable>. Compile Noir source in-place (--noir) or prove from a pre-built compiled-program artifact (--artifact). Defaults to the keccak transcript so proofs verify on-chain against the @noir:verifier contract; read the verifier-call arguments back with @noir:proof.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the proof JSON string to",
    },
  ],
  opts: [
    {
      name: "noir",
      type: "string",
      description:
        "Noir source (or a http(s)/ipfs URL) to compile in-place instead of --artifact — single-file circuits with the stdlib only",
    },
    {
      name: "artifact",
      type: "string",
      description:
        "URL (http(s):// or ipfs://) of a compiled Noir program artifact (nargo target/*.json or @noir:compile output); supports a #sha256=0x… integrity pin",
    },
    {
      name: "oracle",
      type: "string",
      description:
        "Proof transcript: keccak (default; verifiable on-chain by the @noir:verifier contract) or poseidon (bb's native transcript, off-chain use only)",
    },
    {
      name: "inputs",
      type: "any",
      description:
        "Circuit inputs: an entries array like [[x 3] [y 11]] (nest values for array inputs), or a JSON object string (required for struct inputs)",
    },
  ],
  async run(module, { variable }, { opts }) {
    if (opts.noir !== undefined && opts.artifact !== undefined) {
      throw new ErrorException(
        "noir:prove: --noir is mutually exclusive with --artifact",
      );
    }
    if (opts.noir === undefined && opts.artifact === undefined) {
      throw new ErrorException("noir:prove: --noir or --artifact is required");
    }
    if (opts.inputs === undefined) {
      throw new ErrorException("noir:prove: --inputs is required");
    }
    const inputs = parseNoirInputs(opts.inputs);
    const oracle: Oracle =
      opts.oracle !== undefined
        ? parseOracleValue(String(opts.oracle))
        : "keccak";

    const checkAborted = () => {
      if (module.context.signal?.aborted) {
        throw new ErrorException("noir:prove: aborted");
      }
    };
    const ctx = {
      log: (message: string) => module.context.log(message),
      fetchIpfs: (cidPath: string) => module.ipfsResolver.bytes(cidPath),
    };

    checkAborted();
    let program: NoirProgramArtifact;
    let compileKey: string;
    if (opts.noir !== undefined) {
      const compiled = await compileNoirCached(String(opts.noir), ctx);
      program = compiled.program;
      compileKey = compiled.compileKey;
    } else {
      module.context.log("noir:prove: fetching the circuit artifact…");
      const bytes = await fetchArtifact(String(opts.artifact), "artifact", {
        ...ctx,
        errorPrefix: "noir:prove: ",
      });
      const json = new TextDecoder().decode(bytes);
      program = parseArtifactJson(json, "noir:prove: --artifact");
      compileKey = artifactCompileKey(json);
    }

    checkAborted();
    const { proof, publicInputs } = await proveUltraHonk(
      compileKey,
      program,
      inputs,
      oracle,
      ctx,
    );

    checkAborted();
    module.bindingsManager.setBinding(
      variable,
      JSON.stringify({ proof, publicInputs, oracle }),
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    module.context.log(
      `:success: noir:prove: proof generated (${publicInputs.length} public input(s))`,
    );

    return [];
  },
});
