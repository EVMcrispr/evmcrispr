import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
// Reachable address with no code on the fork.
const EMPTY = "0x00000000000000000000000000000000000000ff";

/** A staticcall that really reverts: nobody has approved this allowance,
 *  so the transfer fails inside the token rather than at the ABI layer. */
const REVERTING = `${WXDAI}::{transferFrom(address,address,uint256)(bool) ${HOLDER} ${WXDAI} 1000000000000000000000000000000}`;

describeHelper(
  "@ok",
  {
    cases: [
      {
        name: "true when the call resolves",
        input: `@ok(${WXDAI}::{decimals()(uint8)})`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
      {
        name: "false when the call reverts",
        input: `@ok(${REVERTING})`,
        validate: (result) => {
          expect(result).to.equal(false);
        },
      },
      {
        // A staticcall into an empty account returns no data, which leaves
        // the on-chain core with no word to splice — so both faces agree
        // that there is nothing there.
        name: "false when the target has no code",
        input: `@ok(${EMPTY}::{decimals()(uint8)})`,
        validate: (result) => {
          expect(result).to.equal(false);
        },
      },
    ],
    errorCases: [
      {
        name: "refuses a build-time constant",
        input: `@ok(${WXDAI})`,
        error: "needs a live call to probe",
      },
      {
        // The point of the error taxonomy: a script mistake must not be
        // reported as a revert, or @ok becomes a way to hide typos.
        name: "propagates an unknown variable instead of answering false",
        input: "@ok($notdefined::{decimals()(uint8)})",
        error: "$notdefined",
      },
      {
        name: "propagates a missing ABI instead of answering false",
        input: `@ok(${WXDAI}::decimals())`,
        error: "no ABI found",
      },
    ],
    docCases: [
      {
        // Written out rather than interpolated: generate-docs reads this
        // file as TEXT, so a template variable would reach the docs raw.
        description: "Probe whether a view call resolves, at build time",
        code: 'set $supported @ok(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)})\nprint $supported',
      },
    ],
  },
  helpers.ok.argDefs,
);
