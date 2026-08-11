import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import {
  installMockTarget,
  MOCK_TARGET_ADDRESS,
} from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

// The vendored MockTarget fixture: getValue() = 42, plus known reverts.
const MOCK = MOCK_TARGET_ADDRESS;
const VALUE = `${MOCK}::{getValue()(uint256)}`;

describeHelper(
  "@ifElse",
  {
    setup: async (client) => {
      await installMockTarget(client);
    },
    cases: [
      {
        name: "takes the then branch on a true expression",
        input: "@ifElse(2 > 1 ? 7 : 9)",
        expected: 7n,
      },
      {
        name: "takes the else branch on a false expression",
        input: "@ifElse(2 > 3 ? 7 : 9)",
        expected: 9n,
      },
      {
        name: "judges a single token by truthiness",
        input: "@ifElse(5 ? 7 : 9)",
        expected: 7n,
      },
      {
        name: "zero is false",
        input: "@ifElse(0 ? 7 : 9)",
        expected: 9n,
      },
      {
        name: "branches on a live read",
        input: `@ifElse(${VALUE} > 41 ? 7 : 9)`,
        expected: 7n,
      },
      {
        // The point of laziness: the loser here is a read that reverts,
        // and it must never be attempted.
        name: "never evaluates the losing branch",
        input: `@ifElse(2 > 1 ? 7 : ${MOCK}::{revertsWithArgs()(uint256)})`,
        expected: 7n,
      },
      {
        name: "selects non-numeric values too",
        input: '@ifElse(2 > 1 ? "yes" : "no")',
        validate: (result) => {
          expect(result).to.equal("yes");
        },
      },
      {
        name: "branches can be expressions",
        input: `@ifElse(${VALUE} > 41 ? ${VALUE} + 8 : ${VALUE} - 8)`,
        expected: 50n,
      },
      {
        name: "parenthesized ternaries nest as branches",
        input: "@ifElse(2 > 1 ? (0 ? 7 : 8) : 9)",
        expected: 8n,
      },
      {
        name: "nests with boolean-expression inner branches",
        input: `@ifElse(${VALUE} > 41 ? (${VALUE} > 100 ? 1 : ${VALUE} - 40) : 3)`,
        expected: 2n,
      },
      {
        name: "the else side nests too",
        input: "@ifElse(0 ? 1 : (2 > 1 ? 5 : 6))",
        expected: 5n,
      },
    ],
    errorCases: [
      {
        name: "requires the full ternary shape",
        input: "@ifElse(1 2 3)",
        error: "ternary",
      },
      {
        name: "requires a condition before the ?",
        input: "@ifElse(? 1 : 2)",
        error: "needs a condition",
      },
      {
        // Without spaces the colon glues into one bareword and the `:`
        // never parses — the error points at the spacing.
        name: "hints at spaces when the colon is glued",
        input: "@ifElse(1 ? 2:3)",
        error: "spaces",
      },
      {
        name: "requires parentheses around nested ternaries",
        input: "@ifElse(1 ? 2 ? 3 : 4 : 5)",
        error: "parenthesize",
      },
    ],
    docCases: [
      {
        // Written out rather than interpolated: generate-docs reads this
        // file as TEXT, so a template variable would reach the docs raw.
        description: "Branch on a live read at build time",
        code: "set $fee @ifElse(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} == 18 ? 100 : 200)\nprint $fee",
      },
    ],
    // Rest args have no fixed arity for the auto-test to overflow.
    skipArgLengthCheck: true,
  },
  helpers.ifElse.argDefs,
);
