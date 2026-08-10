import "../../setup";
import {
  describeParity,
  encodeBytes32ArrayReturn,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import type { Hex } from "viem";
import { helpers } from "../../../src/_generated";
import { LEAF_A, LEAF_B, LEAF_C } from "../../fixtures";

/**
 * @crypto's one both-faced helper, verified end to end.
 *
 * The circle closes on itself: the tree is BUILT by the off-chain helpers
 * (`@merkle.root` / `@merkle.proof`), and the same root and proof are then
 * folded on-chain through `hashPairSorted` and compared. Neither side is
 * checked against a hash written down by hand, so an error in either face
 * shows up as the two disagreeing.
 *
 * `@merkle.verify!` folds through `foldWords`, and `wordsArg` accepts only a
 * `::` call or a nested `!` face — never a constant array — so the proof has
 * to arrive from a contract. Nothing on the Gnosis fork returns a `bytes32[]`
 * proof for a tree whose root we know, so a constant-returning mock stands in.
 * It is only a data source: what is under test is the fold.
 */

const LEAVES = `[${LEAF_A} ${LEAF_B} ${LEAF_C}]`;

/** Built by `@crypto:merkle.root([A B C])`; the sorted-pair root. A case
 *  below recomputes it off-chain, so a drift in the builder is a failure
 *  rather than a silently updated constant. */
const ROOT =
  "0x87fbd8dad686d9536b2ef65757c3415df1b7a4664deb34eda3d91234936eb5fe";
/** `@crypto:merkle.proof([A B C] 0)` — the siblings of LEAF_A. */
const PROOF: Hex[] = [LEAF_B as Hex, LEAF_C as Hex];

/** Any address with no code on the fork; the mock is installed here. */
const DIST = "0x00000000000000000000000000000000000d1541";
/** The mock ignores the selector, so the signature only has to declare the
 *  return type the face needs. */
const PROOF_CALL = `${DIST}::{proofOf(address)(bytes32[]) ${LEAF_A.slice(0, 42)}}`;

describeParity("@crypto", {
  module: "crypto",
  helpers,
  setup: (client) =>
    installConstantMock(
      client,
      DIST,
      encodeBytes32ArrayReturn(PROOF),
    ) as Promise<void>,
  cases: [
    {
      // The off-chain side builds the tree from the leaves and verifies it;
      // the on-chain side folds the same proof read live from a contract.
      name: "a proof built off-chain verifies on-chain",
      run: `@crypto:merkle.verify(@crypto:merkle.root(${LEAVES}) ${LEAF_A} @crypto:merkle.proof(${LEAVES} 0))`,
      compile: `@crypto:merkle.verify!(${ROOT} ${LEAF_A} ${PROOF_CALL})`,
    },
    {
      // The same proof against a leaf that is not in the tree: both faces
      // must say false, not merely fail to say true.
      name: "a leaf outside the tree fails on both faces",
      run: `@crypto:merkle.verify(@crypto:merkle.root(${LEAVES}) 0x4444444444444444444444444444444444444444444444444444444444444444 @crypto:merkle.proof(${LEAVES} 0))`,
      compile: `@crypto:merkle.verify!(${ROOT} 0x4444444444444444444444444444444444444444444444444444444444444444 ${PROOF_CALL})`,
    },
    {
      // Pins that the hardcoded ROOT above really is what the builder emits,
      // so the two cases cannot pass against a stale constant.
      name: "the off-chain builder reproduces the root the on-chain fold is checked against",
      run: `@crypto:merkle.root(${LEAVES})`,
      compile: ROOT,
    },
    {
      name: "refuses: a constant proof array, which has no words payload",
      run: `@crypto:merkle.verify(${ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}])`,
      compile: `@crypto:merkle.verify!(${ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}])`,
      helper: "merkle.verify",
      refuses: /expects a `::` call expression or a nested on-chain array face/,
    },
    {
      name: "refuses: the positional (indexed) form",
      run: `@crypto:merkle.verify(${ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}] 0)`,
      compile: `@crypto:merkle.verify!(${ROOT} ${LEAF_A} [${LEAF_B} ${LEAF_C}] 0)`,
      helper: "merkle.verify",
      refuses: /positional \(indexed\) verification stays off-chain/,
    },
  ],
});
