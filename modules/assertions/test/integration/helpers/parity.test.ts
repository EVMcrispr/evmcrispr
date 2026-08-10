import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * @assertions' both-faced helpers.
 *
 * Both are cases where the plain face answers about composition time and the
 * `!` face answers about judgement time. They agree here because the fork does
 * not move between the two, which is what makes them comparable at all.
 */

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const EOA = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describeParity("@assertions", {
  module: "assertions [@chainid @codehash]",
  helpers,
  cases: [
    {
      // Off-chain this is the chain the script was composed against; on-chain
      // it is the CHAINID of the chain judging the assertion.
      name: "chainid agrees when composed and judged on the same chain",
      run: "@chainid()",
      compile: "@chainid!()",
    },
    {
      name: "codehash of a contract",
      run: `@codehash(${WXDAI})`,
      compile: `@codehash!(${WXDAI})`,
    },
    {
      // EXTCODEHASH of an account with no code is keccak of the empty string,
      // not zero — worth pinning because the two are easy to confuse.
      name: "codehash of an account with no code",
      run: `@codehash(${EOA})`,
      compile: `@codehash!(${EOA})`,
    },
  ],
});
