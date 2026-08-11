import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import {
  installMockTarget,
  MOCK_TARGET_ADDRESS,
} from "@evmcrispr/test-utils/onchain";
import { getAddress } from "viem";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
// Reachable address with no code on the fork.
const EMPTY = "0x00000000000000000000000000000000000000ff";
// The vendored MockTarget fixture: known custom errors to match against.
const MOCK = MOCK_TARGET_ADDRESS;

/** A staticcall that really reverts: nobody has approved this allowance,
 *  so the transfer fails inside the token rather than at the ABI layer. */
const REVERTING = `${WXDAI}::{transferFrom(address,address,uint256)(bool) ${HOLDER} ${WXDAI} 1000000000000000000000000000000}`;

/** MockTarget probes: reverts InsufficientBalance(7, 100). */
const INSUFFICIENT = `${MOCK}::{revertsWithArgs()()}`;

describeHelper(
  "@reverts",
  {
    setup: async (client) => {
      await installMockTarget(client);
    },
    cases: [
      {
        name: "false when the call resolves",
        input: `@reverts(${WXDAI}::{decimals()(uint8)})`,
        validate: (result) => {
          expect(result).to.equal(false);
        },
      },
      {
        name: "true when the call reverts",
        input: `@reverts(${REVERTING})`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
      {
        // A staticcall into an empty account returns no data, which leaves
        // the on-chain core with no word to splice — so both faces agree
        // that there is nothing there.
        name: "true when the target has no code",
        input: `@reverts(${EMPTY}::{decimals()(uint8)})`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
      // ---- the arrow: match the revert reason -------------------------
      {
        name: "arrow is true when the error matches",
        input: `@reverts(${INSUFFICIENT} -!> InsufficientBalance(uint256,uint256))`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
      {
        name: "arrow is false when the call reverts with a different error",
        input: `@reverts(${INSUFFICIENT} -!> Unauthorized())`,
        validate: (result) => {
          expect(result).to.equal(false);
        },
      },
      {
        name: "arrow is false when the call resolves",
        input: `@reverts(${MOCK}::{getValue()(uint256)} -!> Unauthorized())`,
        validate: (result) => {
          expect(result).to.equal(false);
        },
      },
      {
        name: "arrow is false when the revert carries no data",
        input: `@reverts(${MOCK}::{revertsBare()()} -!> Unauthorized())`,
        validate: (result) => {
          expect(result).to.equal(false);
        },
      },
      {
        name: "arrow matches the Error(string) builtin",
        input: `@reverts(${MOCK}::{revertingFunction()()} -!> Error(string))`,
        validate: (result) => {
          expect(result).to.equal(true);
        },
      },
      // ---- the lens: an error argument as the value -------------------
      {
        name: "a lens returns the selected error argument",
        input: `@reverts(${INSUFFICIENT} -!> InsufficientBalance(uint256,uint256) [_ $])`,
        validate: (result) => {
          expect(result).to.equal(100n);
        },
      },
      {
        name: "a lens decodes a string reason",
        input: `@reverts(${MOCK}::{revertingFunction()()} -!> Error(string) [$])`,
        validate: (result) => {
          expect(result).to.equal("MockTarget: intentional revert");
        },
      },
      {
        name: "a nested lens descends into an array error argument",
        input: `@reverts(${MOCK}::{revertsWithRedirect()()} -!> Redirect(address,address[]) [_ [$]])`,
        validate: (result) => {
          expect(result).to.equal(getAddress(MOCK));
        },
      },
    ],
    errorCases: [
      {
        name: "refuses a build-time constant",
        input: `@reverts(${WXDAI})`,
        error: "needs a live call to probe",
      },
      {
        // The point of the error taxonomy: a script mistake must not be
        // reported as a revert, or @reverts becomes a way to hide typos.
        name: "propagates an unknown variable instead of answering true",
        input: "@reverts($notdefined::{decimals()(uint8)})",
        error: "$notdefined",
      },
      {
        name: "propagates a missing ABI instead of answering true",
        input: `@reverts(${WXDAI}::decimals())`,
        error: "no ABI found",
      },
      {
        name: "refuses -?!> — fallbacks are @orElse's job",
        input: `@reverts(${INSUFFICIENT} -?!> Unauthorized())`,
        error: "has no probe form",
      },
      {
        name: "refuses a lens over a zero-argument error",
        input: `@reverts(${MOCK}::{revertsUnauthorized()()} -!> Unauthorized() [$])`,
        error: "nothing for a lens to select",
      },
      {
        name: "requires inline types for a custom error",
        input: `@reverts(${INSUFFICIENT} -!> InsufficientBalance)`,
        error: "spelled inline",
      },
      {
        name: "refuses a return lens on the probed call",
        input: `@reverts(${MOCK}::{getValue()(uint256)}[$] -!> Unauthorized())`,
        error: "return lens on a probed call",
      },
      {
        name: "a lens demands the revert: a resolving call throws",
        input: `@reverts(${INSUFFICIENT.replace("revertsWithArgs", "getValue")} -!> InsufficientBalance(uint256,uint256) [_ $])`,
        error: "but it resolved",
      },
    ],
    docCases: [
      {
        // Written out rather than interpolated: generate-docs reads this
        // file as TEXT, so a template variable would reach the docs raw.
        description: "Probe whether a view call reverts, at build time",
        code: "set $missing @reverts(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)})\nprint $missing",
      },
    ],
    // Fill every positional slot so the arg-length test overflows the max.
    sampleArgs: [
      `${WXDAI}::{decimals()(uint8)}`,
      "-!>",
      "Error(string)",
      "[$]",
    ],
  },
  helpers.reverts.argDefs,
);
