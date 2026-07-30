import "../../setup";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { WASM_URL, ZKEY_URL } from "../../fixtures";
import { MULTIPLIER2_VERIFIER_BYTECODE } from "../../fixtures/multiplier2-verifier";

const PROVE = (inputs: string) =>
  `zk:prove $proof --wasm ${WASM_URL} --zkey ${ZKEY_URL} --inputs '${inputs}'`;

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
    "Zk > commands > prove <$variable> --wasm <url> --zkey <url> --inputs <json>",
  cases: [
    {
      name: "generates a groth16 proof and binds it as JSON",
      script: PROVE('{"a":3,"b":11}'),
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
      name: "reuses cached artifacts across proves in one script",
      script: [
        PROVE('{"a":5,"b":8}'),
        "set $first $proof",
        PROVE('{"a":2,"b":21}'),
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
      name: "proves and verifies on-chain against the snarkjs-exported verifier inside sim:fork",
      script: `load sim
load contracts
load lang
sim:fork --using anvil (
  sim:set-balance @me 1000e18
  contracts:deploy $verifier ${MULTIPLIER2_VERIFIER_BYTECODE}
  ${PROVE('{"a":3,"b":11}')}
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
  ],
  errorCases: [
    {
      name: "should fail when options are missing",
      script: "zk:prove $proof --wasm https://zk.test/multiplier2/circuit.wasm",
      error: "zk:prove: --zkey, --inputs are required",
    },
    {
      name: "should fail on invalid inputs JSON",
      script: `zk:prove $proof --wasm ${WASM_URL} --zkey ${ZKEY_URL} --inputs 'nope'`,
      error: "zk:prove: --inputs must be valid JSON",
    },
    {
      name: "should fail when inputs are not a JSON object",
      script: `zk:prove $proof --wasm ${WASM_URL} --zkey ${ZKEY_URL} --inputs '[1, 2]'`,
      error: "zk:prove: --inputs must be a JSON object of circuit signals",
    },
    {
      name: "should fail on a non-URL artifact",
      script: `zk:prove $proof --wasm ./circuit.wasm --zkey ${ZKEY_URL} --inputs '{"a":1,"b":2}'`,
      error: "<wasm> must be an http(s):// or ipfs:// URL",
    },
    {
      name: "should fail when an artifact is missing",
      script: `zk:prove $proof --wasm ${WASM_URL} --zkey https://zk.test/missing/final.zkey --inputs '{"a":1,"b":2}'`,
      error: "404",
    },
    {
      name: "should surface snarkjs errors on wrong signal names",
      script: `zk:prove $proof --wasm ${WASM_URL} --zkey ${ZKEY_URL} --inputs '{"a":3,"wrong":11}'`,
      error: "zk:prove: proving failed",
    },
  ],
});
