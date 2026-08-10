import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";
import { LEAF_A, LEAF_B, LEAF_C } from "../../fixtures";

/**
 * @crypto's one both-faced helper.
 *
 * There is no value case here, and that is the finding rather than a gap:
 * `@merkle.verify!` folds the proof through `foldWords`, and `wordsArg`
 * accepts only a `::` call or a nested `!` array face — never a constant
 * array. So the on-chain face needs a contract that RETURNS a `bytes32[]`
 * proof, and no target on the Gnosis fork exposes one for a tree whose root
 * we know. Pinning the two refusals is what can honestly be tested, and both
 * are shapes a user reaches for first.
 */

const SORTED_ROOT =
  "0x87fbd8dad686d9536b2ef65757c3415df1b7a4664deb34eda3d91234936eb5fe";

describeParity("@crypto", {
  module: "crypto",
  helpers,
  cases: [
    {
      name: "refuses: a constant proof array, which has no words payload",
      run: `@crypto:merkle.verify(${SORTED_ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}])`,
      compile: `@crypto:merkle.verify!(${SORTED_ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}])`,
      helper: "merkle.verify",
      refuses: /expects a `::` call expression or a nested on-chain array face/,
    },
    {
      name: "refuses: the positional (indexed) form",
      run: `@crypto:merkle.verify(${SORTED_ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}] 0)`,
      compile: `@crypto:merkle.verify!(${SORTED_ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}] 0)`,
      helper: "merkle.verify",
      refuses: /positional \(indexed\) verification stays off-chain/,
    },
  ],
});
