import "../../setup";
import type { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@circom:eddsa.pub",
  {
    module: "circom",
    cases: [
      {
        name: "derives a Baby Jubjub public key as [x y]",
        input: '@circom:eddsa.pub("my secret")',
        validate: (result) => {
          expect(result).to.have.length(2);
          for (const coord of result as Num[]) {
            expect(coord.toBigInt() > 0n).to.be.true;
          }
        },
      },
    ],
    errorCases: [
      {
        name: "should fail on an empty secret",
        input: '@circom:eddsa.pub("")',
        error: "<secret> must be a non-empty string",
      },
    ],
    sampleArgs: ['"secret"'],
    docCases: [
      {
        description: "Derive an identity public key from a secret",
        code: 'set [$x $y] @circom:eddsa.pub("my secret seed")\nprint "Pubkey:" $x $y',
      },
    ],
  },
  helpers["eddsa.pub"].argDefs,
);

describeHelper(
  "@circom:eddsa.sign",
  {
    module: "circom",
    cases: [
      {
        name: "signs a message verifiably",
        input: "@circom:eddsa.verify(42 $sig $pub)",
        expected: "true",
      },
      {
        name: "signature does not verify a different message",
        input: "@circom:eddsa.verify(43 $sig $pub)",
        expected: "false",
      },
    ],
    preamble: [
      'set $sig @circom:eddsa.sign("my secret" 42)',
      'set $pub @circom:eddsa.pub("my secret")',
    ].join("\n"),
    errorCases: [
      {
        name: "should fail on a non-integer message",
        input: '@circom:eddsa.sign("s" 1.5)',
        error: "<message> must be a field element",
      },
    ],
    sampleArgs: ['"secret"', "42"],
    docCases: [
      {
        description: "Sign a field element and verify the signature",
        code: 'set $msg @circom:field(@hash("vote for 42"))\nset $sig @circom:eddsa.sign("my secret seed" $msg)\nset $pub @circom:eddsa.pub("my secret seed")\nprint "Valid:" @circom:eddsa.verify($msg $sig $pub)',
      },
    ],
  },
  helpers["eddsa.sign"].argDefs,
);

describeHelper(
  "@circom:eddsa.verify",
  {
    module: "circom",
    cases: [
      {
        name: "rejects malformed signature shapes",
        input: "@circom:eddsa.verify(42 [1 2] $pub)",
        expected: "false",
      },
    ],
    preamble: 'set $pub @circom:eddsa.pub("my secret")',
    sampleArgs: ["42", "[1 2 3]", "[4 5]"],
  },
  helpers["eddsa.verify"].argDefs,
);
