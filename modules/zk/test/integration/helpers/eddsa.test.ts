import "../../setup";
import type { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@zk:eddsa.pub",
  {
    module: "zk",
    cases: [
      {
        name: "derives a Baby Jubjub public key as [x y]",
        input: '@zk:eddsa.pub("my secret")',
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
        input: '@zk:eddsa.pub("")',
        error: "<secret> must be a non-empty string",
      },
    ],
    sampleArgs: ['"secret"'],
    docCases: [
      {
        description: "Derive an identity public key from a secret",
        code: 'set [$x $y] @zk:eddsa.pub("my secret seed")\nprint "Pubkey:" $x $y',
      },
    ],
  },
  helpers["eddsa.pub"].argDefs,
);

describeHelper(
  "@zk:eddsa.sign",
  {
    module: "zk",
    cases: [
      {
        name: "signs a message verifiably",
        input: "@zk:eddsa.verify(42 $sig $pub)",
        expected: "true",
      },
      {
        name: "signature does not verify a different message",
        input: "@zk:eddsa.verify(43 $sig $pub)",
        expected: "false",
      },
    ],
    preamble: [
      'set $sig @zk:eddsa.sign("my secret" 42)',
      'set $pub @zk:eddsa.pub("my secret")',
    ].join("\n"),
    errorCases: [
      {
        name: "should fail on a non-integer message",
        input: '@zk:eddsa.sign("s" 1.5)',
        error: "<message> must be a field element",
      },
    ],
    sampleArgs: ['"secret"', "42"],
    docCases: [
      {
        description: "Sign a field element and verify the signature",
        code: 'set $msg @zk:field(@hash("vote for 42"))\nset $sig @zk:eddsa.sign("my secret seed" $msg)\nset $pub @zk:eddsa.pub("my secret seed")\nprint "Valid:" @zk:eddsa.verify($msg $sig $pub)',
      },
    ],
  },
  helpers["eddsa.sign"].argDefs,
);

describeHelper(
  "@zk:eddsa.verify",
  {
    module: "zk",
    cases: [
      {
        name: "rejects malformed signature shapes",
        input: "@zk:eddsa.verify(42 [1 2] $pub)",
        expected: "false",
      },
    ],
    preamble: 'set $pub @zk:eddsa.pub("my secret")',
    sampleArgs: ["42", "[1 2 3]", "[4 5]"],
  },
  helpers["eddsa.verify"].argDefs,
);
