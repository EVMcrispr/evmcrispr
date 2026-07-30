import { BindingsSpace, defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Zk from "..";
import { fetchArtifact, groth16FullProve } from "../utils/snarkjs";

export default defineCommand<Zk>({
  name: "prove",
  description:
    "Generate a Groth16 proof with snarkjs from pre-built circom artifacts and bind the result (proof + public signals, as JSON) to <variable>. Read the verifier-call arguments back with @zk:proof.",
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
      name: "inputs",
      type: "string",
      description: "Circuit input signals as a JSON object string",
    },
  ],
  async run(module, { variable }, { opts }) {
    const missing = ["wasm", "zkey", "inputs"].filter(
      (name) => opts[name] === undefined,
    );
    if (missing.length) {
      throw new ErrorException(
        `zk:prove: ${missing.map((name) => `--${name}`).join(", ")} ${missing.length > 1 ? "are" : "is"} required`,
      );
    }

    let inputs: Record<string, unknown>;
    try {
      inputs = JSON.parse(opts.inputs);
    } catch {
      throw new ErrorException(
        `zk:prove: --inputs must be valid JSON, got ${opts.inputs}`,
      );
    }
    if (
      inputs === null ||
      typeof inputs !== "object" ||
      Array.isArray(inputs)
    ) {
      throw new ErrorException(
        `zk:prove: --inputs must be a JSON object of circuit signals, got ${opts.inputs}`,
      );
    }

    const checkAborted = () => {
      if (module.context.signal?.aborted) {
        throw new ErrorException("zk:prove: aborted");
      }
    };
    const ctx = {
      log: (message: string) => module.context.log(message),
      resolveIpfs: (url: string) =>
        module.ipfsResolver.url(url.replace(/^ipfs:\/\//, "")),
    };

    checkAborted();
    module.context.log("zk:prove: fetching circuit artifacts…");
    const [wasm, zkey] = await Promise.all([
      fetchArtifact(opts.wasm, "wasm", ctx),
      fetchArtifact(opts.zkey, "zkey", ctx),
    ]);

    checkAborted();
    module.context.log(
      "zk:prove: generating proof… (this can take a while for large circuits)",
    );
    let proof: Record<string, unknown>;
    let publicSignals: string[];
    try {
      ({ proof, publicSignals } = await groth16FullProve(inputs, wasm, zkey));
    } catch (err) {
      throw new ErrorException(
        `zk:prove: proving failed — ${(err as Error).message ?? err}`,
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
      `:success: zk:prove: proof generated (${publicSignals.length} public signal(s))`,
    );

    return [];
  },
});
