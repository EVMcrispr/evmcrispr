import "../../setup";
import { beforeAll } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  fetchReleaseList,
  loadCompiler,
} from "../../../../contracts/src/utils/solcLoader";
import { WASM_URL, ZKEY_URL } from "../../fixtures";
import { MULTIPLIER2_VERIFIER_BYTECODE } from "../../fixtures/multiplier2-verifier";

const PROVE = (inputs: string) =>
  `zk:prove $proof --wasm ${WASM_URL} --zkey ${ZKEY_URL} --inputs ${inputs}`;

const MULTIPLIER_HEREDOC = `set $src <<<CIRCOM
pragma circom 2.0.0;

template Multiplier2() {
    signal input a;
    signal input b;
    signal output c;
    c <== a * b;
}

component main = Multiplier2();
CIRCOM`;

// The Phase 2 lifecycle case compiles the exported verifier with solc —
// prewarm the (~9 MB) compiler download so per-case timeouts hold.
beforeAll(async () => {
  const { releases } = await fetchReleaseList();
  await loadCompiler(releases["0.8.26"]);
}, 120_000);

function boundProof(interpreter: {
  getBinding(name: string, space: BindingsSpace): unknown;
}): { proof: { protocol: string }; publicSignals: string[] } {
  const bound = interpreter.getBinding("$proof", BindingsSpace.USER);
  expect(bound).to.be.a("string");
  return JSON.parse(bound as string);
}

describeCommand("prove", {
  module: "zk",
  preamble: "load zk",
  describeName:
    "Zk > commands > prove <$variable> --wasm/--zkey | --circom [--ptau] --inputs <entries|json>",
  cases: [
    {
      name: "generates a groth16 proof from entries inputs and binds it as JSON",
      script: PROVE("[[a 3] [b 11]]"),
      timeout: 30000,
      validate: (_actions, interpreter) => {
        const { proof, publicSignals } = boundProof(interpreter);
        // Proof bytes are randomized per run — assert structure and
        // public signals only, never coordinates.
        expect(proof.protocol).to.equal("groth16");
        expect(publicSignals).to.deep.equal(["33"]);
      },
    },
    {
      name: "accepts the record form [a:3 b:11] for inputs",
      script: PROVE("[a:3 b:11]"),
      timeout: 30000,
      validate: (_actions, interpreter) => {
        const { proof, publicSignals } = boundProof(interpreter);
        expect(proof.protocol).to.equal("groth16");
        expect(publicSignals).to.deep.equal(["33"]);
      },
    },
    {
      name: "still accepts JSON-string inputs for snarkjs interop",
      script: PROVE(`'{"a":4,"b":10}'`),
      timeout: 30000,
      validate: (_actions, interpreter) => {
        expect(boundProof(interpreter).publicSignals).to.deep.equal(["40"]);
      },
    },
    {
      name: "reuses cached artifacts across proves in one script",
      script: [
        PROVE("[[a 5] [b 8]]"),
        "set $first $proof",
        PROVE("[[a 2] [b 21]]"),
        "set $second $proof",
      ].join("\n"),
      timeout: 30000,
      validate: (_actions, interpreter) => {
        const signal = (name: string) => {
          const bound = interpreter.getBinding(name, BindingsSpace.USER);
          return JSON.parse(bound as string).publicSignals[0];
        };
        expect(signal("$first")).to.equal("40");
        expect(signal("$second")).to.equal("42");
      },
    },
    {
      name: "proves with a deterministic plonk setup (--system plonk)",
      script: `${MULTIPLIER_HEREDOC}
zk:prove $proof --circom $src --ptau dev --system plonk --inputs [[a 6] [b 7]]`,
      timeout: 60000,
      validate: (_actions, interpreter) => {
        const { proof, publicSignals } = boundProof(interpreter);
        expect(proof.protocol).to.equal("plonk");
        expect(publicSignals).to.deep.equal(["42"]);
      },
    },
    {
      name: "auto-detects the proof system from a pre-built plonk zkey",
      script: `zk:prove $proof --wasm ${WASM_URL} --zkey https://zk.test/multiplier2/plonk.zkey --inputs [[a 6] [b 7]]`,
      timeout: 60000,
      validate: (_actions, interpreter) => {
        const { proof, publicSignals } = boundProof(interpreter);
        expect(proof.protocol).to.equal("plonk");
        expect(publicSignals).to.deep.equal(["42"]);
      },
    },
    {
      name: "verifies a plonk proof on-chain against the exported PlonkVerifier",
      script: `load sim
load contracts
load lang
${MULTIPLIER_HEREDOC}
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  contracts:deploy $verifier @contracts:solidity(@zk:circom.verifier($src ptau:dev system:plonk) version:0.8.26)
  zk:prove $proof --circom $src --ptau dev --system plonk --inputs [[a 3] [b 11]]
  set [$p $signals] @zk:proof($proof)
  sim:expect @bool(@lang:at($signals 0) == 33)
  sim:expect @bool(@get($verifier "verifyProof(uint256[24],uint256[1])(bool)" $p $signals) == true)
)`,
      timeout: 120000,
      validate: () => {
        // The plonk pairing check passing proves the deterministic setup
        // behind the deployed verifier matches the proving zkey.
      },
    },
    {
      name: "compiles and sets up a circuit in-place with --circom --ptau dev",
      script: `${MULTIPLIER_HEREDOC}
zk:prove $proof --circom $src --ptau dev --inputs [[a 3] [b 11]]`,
      timeout: 60000,
      validate: (_actions, interpreter) => {
        expect(boundProof(interpreter).publicSignals).to.deep.equal(["33"]);
      },
    },
    {
      name: "proves and verifies on-chain against the snarkjs-exported verifier inside sim:fork",
      script: `load sim
load contracts
load lang
${MULTIPLIER_HEREDOC}
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  contracts:deploy $verifier ${MULTIPLIER2_VERIFIER_BYTECODE}
  ${PROVE("[[a 3] [b 11]]")}
  set [$a $b $c $signals] @zk:proof($proof)
  sim:expect @bool(@lang:at($signals 0) == 33)
  sim:expect @bool(@get($verifier "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])(bool)" $a $b $c $signals) == true)
)`,
      timeout: 60000,
      validate: () => {
        // Reaching this point means proving succeeded and the on-chain
        // pairing check returned true.
      },
    },
    {
      name: "full dev loop: heredoc circuit, deployed dev verifier, in-place prove, on-chain verify",
      script: `load sim
load contracts
load lang
${MULTIPLIER_HEREDOC}
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  contracts:deploy $verifier @contracts:solidity(@zk:circom.verifier($src ptau:dev) version:0.8.26)
  zk:prove $proof --circom $src --ptau dev --inputs [[a 3] [b 11]]
  set [$a $b $c $signals] @zk:proof($proof)
  sim:expect @bool(@lang:at($signals 0) == 33)
  sim:expect @bool(@get($verifier "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])(bool)" $a $b $c $signals) == true)
)`,
      timeout: 120000,
      validate: () => {
        // The pairing check passing proves the deployed verifier's vkey and
        // the proving zkey came from the same cached setup.
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when artifact options are missing",
      script:
        "zk:prove $proof --wasm https://zk.test/multiplier2/circuit.wasm --inputs [[a 1] [b 2]]",
      error: "zk:prove: --zkey is required (or use --circom)",
    },
    {
      name: "should reject --circom combined with --wasm/--zkey",
      script: `zk:prove $proof --circom "src" --wasm ${WASM_URL} --inputs [[a 1] [b 2]]`,
      error: "--circom is mutually exclusive with --wasm/--zkey",
    },
    {
      name: "should reject --system without --circom",
      script: `${PROVE("[[a 1] [b 2]]")} --system plonk`,
      error: "zk:prove: --system requires --circom",
    },
    {
      name: "should reject an unknown --system value",
      script: `${MULTIPLIER_HEREDOC}
zk:prove $proof --circom $src --system stark --inputs [[a 1] [b 2]]`,
      error: 'unknown proof system "stark"',
    },
    {
      name: "should reject --ptau without --circom",
      script: `${PROVE("[[a 1] [b 2]]")} --ptau dev`,
      error: "zk:prove: --ptau requires --circom",
    },
    {
      name: "should reject an invalid --ptau value",
      script: `${MULTIPLIER_HEREDOC}
zk:prove $proof --circom $src --ptau turbo --inputs [[a 1] [b 2]]`,
      error: 'zk:prove: --ptau must be "dev" or a http(s)/ipfs URL',
    },
    {
      name: "should surface circom diagnostics from --circom",
      script: `zk:prove $proof --circom "template Broken() {" --inputs [[a 1] [b 2]]`,
      error: "@zk:circom: compilation failed",
    },
    {
      name: "should fail on invalid inputs",
      script: `${PROVE("'nope'")}`,
      error: "zk:prove: --inputs must be an entries array",
    },
    {
      name: "should fail when inputs JSON is not an object",
      script: `${PROVE("'[1, 2]'")}`,
      error: "zk:prove: --inputs JSON must be an object",
    },
    {
      name: "should fail on a non-URL artifact",
      script: `zk:prove $proof --wasm ./circuit.wasm --zkey ${ZKEY_URL} --inputs [[a 1] [b 2]]`,
      error: "<wasm> must be an http(s):// or ipfs:// URL",
    },
    {
      name: "should fail when an artifact is missing",
      script: `zk:prove $proof --wasm ${WASM_URL} --zkey https://zk.test/missing/final.zkey --inputs [[a 1] [b 2]]`,
      error: "404",
    },
    {
      name: "should surface snarkjs errors on wrong signal names",
      script: PROVE("[[a 3] [wrong 11]]"),
      error: "zk:prove: proving failed",
    },
  ],
});
