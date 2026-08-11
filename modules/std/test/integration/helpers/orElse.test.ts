import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const DECIMALS = `${WXDAI}::{decimals()(uint8)}`;
/** Reverts: no such allowance exists. */
const REVERTING = `${WXDAI}::{transferFrom(address,address,uint256)(bool) ${HOLDER} ${WXDAI} 1000000000000000000000000000000}`;

const asBigInt = (v: unknown) =>
  v instanceof Num ? v.toBigInt() : BigInt(String(v));

describeHelper(
  "@orElse",
  {
    cases: [
      {
        name: "takes the first branch when it resolves",
        input: `@orElse(${DECIMALS} 99)`,
        validate: (result) => {
          expect(asBigInt(result)).to.equal(18n);
        },
      },
      {
        name: "falls back when the first branch reverts",
        input: `@orElse(${REVERTING} ${DECIMALS})`,
        validate: (result) => {
          expect(asBigInt(result)).to.equal(18n);
        },
      },
      {
        name: "a constant fallback is allowed off-chain",
        input: `@orElse(${REVERTING} 7)`,
        validate: (result) => {
          expect(asBigInt(result)).to.equal(7n);
        },
      },
    ],
    errorCases: [
      {
        name: "refuses a constant as the first branch",
        input: `@orElse(1 ${DECIMALS})`,
        error: "needs a live read as its first branch",
      },
      {
        // Same taxonomy as @reverts: only the chain refusing the read selects
        // the fallback, so a script mistake still surfaces.
        name: "propagates an unknown variable instead of falling back",
        input: `@orElse($notdefined::{decimals()(uint8)} ${DECIMALS})`,
        error: "$notdefined",
      },
    ],
    docCases: [
      {
        // Written out rather than interpolated: generate-docs reads this
        // file as TEXT, so a template variable would reach the docs raw.
        description: "Read a value, with a fallback for contracts that lack it",
        code: "set $d @orElse(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d::{decimals()(uint8)} 18)\nprint $d",
      },
    ],
  },
  helpers.orElse.argDefs,
);
