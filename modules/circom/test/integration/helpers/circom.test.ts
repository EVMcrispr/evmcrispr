import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

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

const INCLUDE_HEREDOC = `set $inc <<<CIRCOM
pragma circom 2.0.0;
include "fakelib@1.0.0/circuits/square.circom";
template Top() { signal input a; signal output out; component s = Square(); s.x <== a; out <== s.y; }
component main = Top();
CIRCOM`;

describeHelper(
  "@circom:constraints",
  {
    module: "circom",
    cases: [
      {
        name: "compiles an inline circuit and counts its constraints",
        input: "@circom:constraints($src)",
        validate: (result) => {
          expect(result.toBigInt()).to.equal(1n);
        },
      },
      {
        name: "crawls includes through the unpkg-style resolver",
        input: "@circom:constraints($inc)",
        validate: (result) => {
          expect(result.toBigInt() >= 1n).to.be.true;
        },
      },
    ],
    preamble: `${MULTIPLIER_HEREDOC}\n${INCLUDE_HEREDOC}\nset $missinginc "include \\"https://zk.test/missing/lib.circom\\";"`,
    errorCases: [
      {
        name: "should surface circom compiler diagnostics",
        input: '@circom:constraints("template Broken() { signal input }")',
        error: "@circom:circom: compilation failed",
      },
      {
        name: "should fail on an unreachable include",
        input: "@circom:constraints($missinginc)",
        error: "404",
      },
    ],
    sampleArgs: ['"pragma circom 2.0.0;"'],
    docCases: [
      {
        description:
          "Check how big a circuit is before setting it up (a 2^p powers-of-tau supports up to 2^p constraints)",
        code: 'set $src <<<CIRCOM\npragma circom 2.0.0;\ntemplate Multiplier2() {\n    signal input a;\n    signal input b;\n    signal output c;\n    c <== a * b;\n}\ncomponent main = Multiplier2();\nCIRCOM\nprint "Constraints:" @circom:constraints($src)',
      },
    ],
  },
  helpers.constraints.argDefs,
);

describeHelper(
  "@circom:verifier",
  {
    module: "circom",
    cases: [
      {
        name: "compiles, runs a dev setup and exports the Solidity verifier",
        input: "@circom:verifier($src ptau:dev)",
        validate: (result) => {
          expect(result).to.include("pragma solidity");
          expect(result).to.include("contract Groth16Verifier");
        },
      },
      {
        name: "auto-downloads a hez powers-of-tau sized to the circuit",
        input: "@circom:verifier($src)",
        validate: (result) => {
          expect(result).to.include("contract Groth16Verifier");
        },
      },
      {
        name: "accepts an explicit ptau URL",
        input: "@circom:verifier($src ptau:https://zk.test/dev.ptau)",
        validate: (result) => {
          expect(result).to.include("contract Groth16Verifier");
        },
      },
      {
        name: "exports a plonk verifier with system:plonk",
        input: "@circom:verifier($src ptau:dev system:plonk)",
        validate: (result) => {
          expect(result).to.include("contract PlonkVerifier");
        },
      },
    ],
    preamble: `${MULTIPLIER_HEREDOC}\nset $missinginc "include \\"https://zk.test/missing/lib.circom\\";"`,
    errorCases: [
      {
        name: "should fail on unknown options",
        input: "@circom:verifier($src turbo:on)",
        error: 'unknown named argument "turbo:"',
      },
    ],
    // The options arg is a rest arg (unbounded arity); option validity is
    // covered by the unknown-option error case.
    skipArgLengthCheck: true,
    sampleArgs: ['"pragma circom 2.0.0;"', "ptau:dev"],
  },
  helpers.verifier.argDefs,
);

describeHelper(
  "@circom:vkey",
  {
    module: "circom",
    cases: [
      {
        name: "returns the verification key JSON of the cached setup",
        input: "@circom:vkey($src ptau:dev)",
        validate: (result) => {
          const vkey = JSON.parse(result);
          expect(vkey.protocol).to.equal("groth16");
          expect(vkey.nPublic).to.equal(1);
        },
      },
    ],
    preamble: MULTIPLIER_HEREDOC,
    skipArgLengthCheck: true,
    sampleArgs: ['"pragma circom 2.0.0;"', "ptau:dev"],
  },
  helpers.vkey.argDefs,
);

describeHelper(
  "@circom:verify",
  {
    module: "circom",
    cases: [
      {
        name: "verifies a proof off-chain against its vkey",
        input: "@circom:verify($proof $vkey)",
        expected: "true",
      },
      {
        name: "rejects a proof against the wrong public signals",
        input: "@circom:verify($tampered $vkey)",
        expected: "false",
      },
    ],
    preamble: [
      "load lang",
      MULTIPLIER_HEREDOC,
      "circom:prove $proof --circom $src --ptau dev --inputs [[a 3] [b 11]]",
      "set $vkey @circom:vkey($src ptau:dev)",
      "set $tampered @lang:str.replace($proof '\"33\"' '\"34\"')",
    ].join("\n"),
    errorCases: [
      {
        name: "should fail on a malformed vkey",
        input: '@circom:verify($proof "nope")',
        error: "<vkey> must be a verification key JSON string",
      },
    ],
    sampleArgs: ['\'{"proof":{},"publicSignals":[]}\'', '"{}"'],
  },
  helpers.verify.argDefs,
);
