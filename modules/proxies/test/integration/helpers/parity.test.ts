import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @proxies' one both-faced helper, and the case where the two faces genuinely
 * cannot agree.
 *
 * They resolve by different mechanisms rather than by different encodings of
 * the same read: off-chain reads the ERC-1967 storage slot, on-chain calls
 * `implementation()` or hops the beacon, because a contract cannot read
 * another contract's storage. So a proxy that keeps its implementation in the
 * slot and exposes no getter has an off-chain answer and no on-chain one —
 * which is what the compileDescription means by "a slot-only proxy has no
 * on-chain form and reverts", and is pinned here rather than left as prose.
 */

/** GNO: an ERC-1967 proxy on Gnosis with no admin slot. */
const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";
/** Giveth TokenDistro: a transparent ERC-1967 proxy. */
const TOKEN_DISTRO = "0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1";

/** Constant mock feeding the live-salt case. */
const SALT_MOCK = "0x00000000000000000000000000000000005a1701";
const SALT =
  "0x00000000000000000000000000000000000000000000000000000000000000aa";

describeParity("@proxies", {
  module: "proxies",
  helpers,
  setup: (client) =>
    installConstantMock(
      client,
      SALT_MOCK,
      encodeAbiParameters([{ type: "bytes32" }], [SALT]),
    ),
  cases: [
    {
      name: "predictClone of a constant salt folds to the plain answer",
      run: `@proxies:predictClone(${GNO} ${SALT})`,
      compile: `@proxies:predictClone!(${GNO} ${SALT})`,
    },
    {
      // CREATE2 recomputed at judgement from a salt read off the mock.
      name: "predictClone of a live salt",
      run: `@proxies:predictClone(${GNO} ${SALT})`,
      compile: `@proxies:predictClone!(${GNO} ${SALT_MOCK}::{salt()(bytes32)})`,
    },
    {
      name: "predictClone refuses a live implementation",
      run: `@proxies:predictClone(${GNO} ${SALT})`,
      compile: `@proxies:predictClone!(${SALT_MOCK}::{impl()(address)} ${SALT})`,
      helper: "predictClone",
      refuses: /implementation and deployer must be constants/,
    },
    {
      // GNO exposes implementation(), so both mechanisms have an answer and
      // must produce the SAME address — an ERC-1967 slot read off-chain
      // against a staticcall on-chain.
      name: "a proxy exposing implementation() agrees with its 1967 slot",
      run: `@proxies:implementation(${GNO})`,
      compile: `@proxies:implementation!(${GNO})`,
    },
    {
      // A transparent proxy answers implementation() only to its admin, so
      // the on-chain route has nothing to call and reverts at judgement time.
      name: "reverts: a transparent proxy hides its getter from everyone else",
      run: `@proxies:implementation(${TOKEN_DISTRO})`,
      compile: `@proxies:implementation!(${TOKEN_DISTRO})`,
      helper: "implementation",
      reverts: /revert/i,
    },
  ],
});
