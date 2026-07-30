import "../../setup";
import { beforeAll } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { compileNoirCached } from "../../../src/utils/noir";
import { ASSERT_SOURCE, SOURCE_URL } from "../../fixtures";
import { CANNED_PROOF_JSON } from "../../fixtures/assert-circuit";

const ASSERT_HEREDOC = `set $src <<<NOIR
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
NOIR`;

// Every helper resolves through the shared compile cache — prewarm it so
// per-case timeouts hold (the bb.js wasm boot is the slow part).
beforeAll(async () => {
  await compileNoirCached(ASSERT_SOURCE, {});
}, 120_000);

describeHelper(
  "@noir:compile",
  {
    module: "noir",
    cases: [
      {
        name: "compiles an inline circuit to a program artifact JSON",
        input: "@noir:compile($src)",
        validate: (result) => {
          const artifact = JSON.parse(result);
          expect(artifact.bytecode).to.be.a("string");
          expect(artifact.abi).to.be.an("object");
          expect(artifact).to.not.have.property("debug_symbols");
        },
      },
      {
        name: "fetches source from a URL",
        input: `@noir:compile("${SOURCE_URL}")`,
        validate: (result) => {
          expect(JSON.parse(result).bytecode).to.be.a("string");
        },
      },
    ],
    preamble: ASSERT_HEREDOC,
    errorCases: [
      {
        name: "should surface Noir compiler diagnostics",
        input: '@noir:compile("fn main( {")',
        error: "@noir:compile: compilation failed",
      },
      {
        name: "should reject external Nargo dependencies",
        input: '@noir:compile("use dep::foo;")',
        error: "external Nargo dependencies",
      },
      {
        name: "should fail on an unreachable source URL",
        input: '@noir:compile("https://noir.test/missing/main.nr")',
        error: "404",
      },
    ],
    sampleArgs: ['"fn main() {}"'],
    docCases: [
      {
        description:
          "Compile a circuit and inspect the artifact you would host for noir:prove --artifact",
        code: 'set $src <<<NOIR\nfn main(x: Field, y: pub Field) {\n    assert(x != y);\n}\nNOIR\nprint "Artifact:" @noir:compile($src)',
      },
    ],
  },
  helpers.compile.argDefs,
);

describeHelper(
  "@noir:vkey",
  {
    module: "noir",
    cases: [
      {
        name: "returns the keccak verification key as hex by default",
        input: "@noir:vkey($src)",
        validate: (result) => {
          expect(result).to.match(/^0x[0-9a-f]+$/);
        },
      },
      {
        name: "computes a different vkey for the poseidon transcript",
        input: "@noir:vkey($src oracle:poseidon)",
        validate: (result) => {
          expect(result).to.match(/^0x[0-9a-f]+$/);
        },
      },
    ],
    preamble: ASSERT_HEREDOC,
    errorCases: [
      {
        name: "should fail on unknown named arguments",
        input: "@noir:vkey($src turbo:on)",
        error: 'unknown named argument "turbo:"',
      },
      {
        name: "should fail on an unknown oracle",
        input: "@noir:vkey($src oracle:sha)",
        error: 'unknown oracle "sha"',
      },
    ],
    skipArgLengthCheck: true,
    sampleArgs: ['"fn main() {}"', "oracle:keccak"],
  },
  helpers.vkey.argDefs,
);

describeHelper(
  "@noir:verifier",
  {
    module: "noir",
    cases: [
      {
        name: "generates the Solidity UltraHonk verifier",
        input: "@noir:verifier($src)",
        validate: (result) => {
          expect(result).to.include("pragma solidity");
          expect(result).to.include("contract HonkVerifier");
          expect(result).to.include(
            "function verify(bytes calldata proof, bytes32[] calldata publicInputs)",
          );
        },
      },
    ],
    preamble: ASSERT_HEREDOC,
    sampleArgs: ['"fn main() {}"'],
  },
  helpers.verifier.argDefs,
);

describeHelper(
  "@noir:verify",
  {
    module: "noir",
    cases: [
      {
        name: "verifies a keccak proof against the matching vkey",
        input: "@noir:verify($proof @noir:vkey($src))",
        expected: "true",
      },
    ],
    preamble: `${ASSERT_HEREDOC}\nset $proof '${CANNED_PROOF_JSON}'`,
    errorCases: [
      {
        name: "should fail on a value that is not proof JSON",
        input: '@noir:verify("not json" "0x1234")',
        error: "bound by noir:prove",
      },
      {
        name: "should fail on a malformed vkey",
        input: '@noir:verify($proof "nope")',
        error: "must be the 0x-hex verification key",
      },
    ],
    sampleArgs: [`'${CANNED_PROOF_JSON}'`, '"0x1234"'],
  },
  helpers.verify.argDefs,
);

describeHelper(
  "@noir:proof",
  {
    module: "noir",
    cases: [
      {
        name: "projects the proof JSON into the [proof publicInputs] verifier tuple",
        input: "@noir:proof($proof)",
        validate: (result) => {
          const [proof, publicInputs] = result as [string, string[]];
          const raw = JSON.parse(CANNED_PROOF_JSON);
          expect(String(proof)).to.equal(raw.proof);
          expect(publicInputs.map(String)).to.deep.equal(raw.publicInputs);
        },
      },
    ],
    preamble: [
      `set $proof '${CANNED_PROOF_JSON}'`,
      `set $notproof '{"hello": 1}'`,
    ].join("\n"),
    errorCases: [
      {
        name: "should fail on a value that is not proof JSON",
        input: '@noir:proof("not json")',
        error: "bound by noir:prove",
      },
      {
        name: "should fail on JSON without a proof shape",
        input: "@noir:proof($notproof)",
        error: "bound by noir:prove",
      },
    ],
    sampleArgs: [`'${CANNED_PROOF_JSON}'`],
  },
  helpers.proof.argDefs,
);
