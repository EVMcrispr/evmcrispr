import "../../setup";
import { beforeAll } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  fetchReleaseList,
  loadCompiler,
} from "../../../../contracts/src/utils/solcLoader";
import { proveUltraHonk } from "../../../src/utils/barretenberg";
import { compileNoirCached } from "../../../src/utils/noir";
import { ARTIFACT_URL, ASSERT_SOURCE } from "../../fixtures";

const SOLC_VERSION = "0.8.28";

const ASSERT_HEREDOC = `set $src <<<NOIR
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
NOIR`;

// Prewarm the slow parts once: the solc download for the lifecycle case,
// and a full prove so the bb.js wasm boot and the SRS download never eat
// into per-case timeouts.
beforeAll(async () => {
  const { releases } = await fetchReleaseList();
  await loadCompiler(releases[SOLC_VERSION]);
  const compiled = await compileNoirCached(ASSERT_SOURCE, {});
  await proveUltraHonk(
    compiled.compileKey,
    compiled.program,
    { x: "1", y: "2" },
    "keccak",
    {},
  );
}, 240_000);

function boundProof(interpreter: {
  getBinding(name: string, space: BindingsSpace): unknown;
}): { proof: string; publicInputs: string[]; oracle: string } {
  const bound = interpreter.getBinding("$proof", BindingsSpace.USER);
  expect(bound).to.be.a("string");
  return JSON.parse(bound as string);
}

const Y5 = `0x${"5".padStart(64, "0")}`;

describeCommand("prove", {
  module: "noir",
  preamble: "load noir",
  describeName:
    "Noir > commands > prove <$variable> --noir | --artifact [--oracle] --inputs <entries|json>",
  cases: [
    {
      name: "compiles in-place, generates a keccak proof and binds it as JSON",
      script: `${ASSERT_HEREDOC}
noir:prove $proof --noir $src --inputs [[x 3] [y 5]]`,
      timeout: 120000,
      validate: (_actions, interpreter) => {
        const { proof, publicInputs, oracle } = boundProof(interpreter);
        // Proof bytes are randomized per run — assert structure and
        // public inputs only, never bytes.
        expect(proof).to.match(/^0x[0-9a-f]+$/);
        expect(oracle).to.equal("keccak");
        expect(publicInputs).to.deep.equal([Y5]);
      },
    },
    {
      name: "still accepts JSON-string inputs for Prover.toml interop",
      script: `${ASSERT_HEREDOC}
noir:prove $proof --noir $src --inputs '{"x":"3","y":"5"}'`,
      timeout: 120000,
      validate: (_actions, interpreter) => {
        expect(boundProof(interpreter).publicInputs).to.deep.equal([Y5]);
      },
    },
    {
      name: "proves from a hosted pre-built artifact (--artifact)",
      script: `noir:prove $proof --artifact ${ARTIFACT_URL} --inputs [[x 3] [y 7]]`,
      timeout: 120000,
      validate: (_actions, interpreter) => {
        expect(boundProof(interpreter).publicInputs).to.deep.equal([
          `0x${"7".padStart(64, "0")}`,
        ]);
      },
    },
    {
      name: "proves with the poseidon transcript (--oracle poseidon) and verifies off-chain",
      script: `${ASSERT_HEREDOC}
noir:prove $proof --noir $src --oracle poseidon --inputs [[x 3] [y 5]]
set $valid @noir:verify($proof @noir:vkey($src oracle:poseidon))`,
      timeout: 120000,
      validate: (_actions, interpreter) => {
        expect(boundProof(interpreter).oracle).to.equal("poseidon");
        expect(
          String(interpreter.getBinding("$valid", BindingsSpace.USER)),
        ).to.equal("true");
      },
    },
    {
      name: "reuses cached compiles across proves in one script",
      script: `${ASSERT_HEREDOC}
noir:prove $proof --noir $src --inputs [[x 3] [y 5]]
set $first $proof
noir:prove $proof --noir $src --inputs [[x 3] [y 9]]
set $second $proof`,
      timeout: 180000,
      validate: (_actions, interpreter) => {
        const input = (name: string) => {
          const bound = interpreter.getBinding(name, BindingsSpace.USER);
          return JSON.parse(bound as string).publicInputs[0];
        };
        expect(input("$first")).to.equal(Y5);
        expect(input("$second")).to.equal(`0x${"9".padStart(64, "0")}`);
      },
    },
    {
      name: "full dev loop: heredoc circuit, deployed HonkVerifier, in-place prove, on-chain verify",
      // The generated verifier keeps its transcript/relations libraries
      // external to stay under the contract size limit, so the script
      // deploys them first and links via the libraries: option.
      script: `load sim
load contracts
${ASSERT_HEREDOC}
set $vsrc @noir:verifier($src)
sim:fork --using anvil (
  sim:set-balance @me 1000000e18
  contracts:deploy $translib @contracts:solidity($vsrc contract:ZKTranscriptLib version:${SOLC_VERSION})
  contracts:deploy $rellib @contracts:solidity($vsrc contract:RelationsLib version:${SOLC_VERSION})
  contracts:deploy $verifier @contracts:solidity($vsrc contract:HonkVerifier version:${SOLC_VERSION} libraries:[[ZKTranscriptLib $translib] [RelationsLib $rellib]])
  noir:prove $proof --noir $src --inputs [[x 3] [y 5]]
  set [$p $signals] @noir:proof($proof)
  sim:expect @bool(@get($verifier "verify(bytes,bytes32[])(bool)" $p $signals) == true)
)`,
      timeout: 240000,
      validate: () => {
        // The on-chain check passing proves the deployed verifier's vkey
        // and the proof came from the same cached compile + transcript.
      },
    },
  ],
  errorCases: [
    {
      name: "should reject --noir combined with --artifact",
      script: `noir:prove $proof --noir "src" --artifact ${ARTIFACT_URL} --inputs [[x 1] [y 2]]`,
      error: "noir:prove: --noir is mutually exclusive with --artifact",
    },
    {
      name: "should require --noir or --artifact",
      script: "noir:prove $proof --inputs [[x 1] [y 2]]",
      error: "noir:prove: --noir or --artifact is required",
    },
    {
      name: "should require --inputs",
      script: `noir:prove $proof --artifact ${ARTIFACT_URL}`,
      error: "noir:prove: --inputs is required",
    },
    {
      name: "should reject an unknown --oracle value",
      script: `noir:prove $proof --artifact ${ARTIFACT_URL} --oracle sha --inputs [[x 1] [y 2]]`,
      error: 'unknown oracle "sha"',
    },
    {
      name: "should surface Noir diagnostics from --noir",
      script: `noir:prove $proof --noir "fn main( {" --inputs [[x 1] [y 2]]`,
      error: "@noir:compile: compilation failed",
    },
    {
      name: "should fail on invalid inputs",
      script: `noir:prove $proof --artifact ${ARTIFACT_URL} --inputs 'nope'`,
      error: "noir:prove: --inputs must be an entries array",
    },
    {
      name: "should fail on a non-URL artifact",
      script: "noir:prove $proof --artifact ./target/main.json --inputs [[x 1] [y 2]]",
      error: "<artifact> must be an http(s):// or ipfs:// URL",
    },
    {
      name: "should fail when the artifact is missing",
      script:
        "noir:prove $proof --artifact https://noir.test/missing/artifact.json --inputs [[x 1] [y 2]]",
      error: "404",
    },
    {
      name: "should fail when the artifact is not a compiled program",
      script: `noir:prove $proof --artifact https://noir.test/assert/main.nr --inputs [[x 1] [y 2]]`,
      error: "not valid JSON",
    },
    {
      name: "should surface circuit execution failures (failed assertion)",
      script: `${ASSERT_HEREDOC}
noir:prove $proof --noir $src --inputs [[x 5] [y 5]]`,
      error: "noir:prove: circuit execution failed",
    },
    {
      name: "should surface execution errors on wrong input names",
      script: `noir:prove $proof --artifact ${ARTIFACT_URL} --inputs [[x 3] [wrong 5]]`,
      error: "noir:prove: circuit execution failed",
    },
  ],
  docCases: [
    {
      description:
        "Prove a statement about a secret and check the proof off-chain — here: I know an x that differs from the public y",
      code: 'set $src <<<NOIR\nfn main(x: Field, y: pub Field) {\n    assert(x != y);\n}\nNOIR\nnoir:prove $proof --noir $src --inputs [[x 3] [y 5]]\nprint "Valid:" @noir:verify($proof @noir:vkey($src))',
    },
  ],
});
