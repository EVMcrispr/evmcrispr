import "../../setup";
import type { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { CANNED_PROOF_JSON } from "../../fixtures/canned-proof";

const raw = JSON.parse(CANNED_PROOF_JSON) as {
  proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
  publicSignals: string[];
};
const toBigInts = (values: unknown[]): unknown[] =>
  values.map((v) => (Array.isArray(v) ? toBigInts(v) : (v as Num).toBigInt()));

describeHelper(
  "@circom:proof",
  {
    module: "circom",
    cases: [
      {
        name: "projects the proof JSON into the [a b c signals] verifier tuple",
        input: "@circom:proof($proof)",
        validate: (result) => {
          const [a, b, c, signals] = toBigInts(result) as [
            bigint[],
            bigint[][],
            bigint[],
            bigint[],
          ];
          expect(a).to.deep.equal([
            BigInt(raw.proof.pi_a[0]),
            BigInt(raw.proof.pi_a[1]),
          ]);
          // pi_b arrives swapped for the on-chain pairing check.
          expect(b).to.deep.equal([
            [BigInt(raw.proof.pi_b[0][1]), BigInt(raw.proof.pi_b[0][0])],
            [BigInt(raw.proof.pi_b[1][1]), BigInt(raw.proof.pi_b[1][0])],
          ]);
          expect(c).to.deep.equal([
            BigInt(raw.proof.pi_c[0]),
            BigInt(raw.proof.pi_c[1]),
          ]);
          expect(signals).to.deep.equal([33n]);
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
        input: '@circom:proof("not json")',
        error: "<proof> is not valid JSON",
      },
      {
        name: "should fail on JSON without a proof shape",
        input: "@circom:proof($notproof)",
        error: '<proof> must be a JSON object with "proof"',
      },
    ],
    sampleArgs: [`'${CANNED_PROOF_JSON}'`],
  },
  helpers.proof.argDefs,
);
