import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
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

describeParity("@proxies", {
  module: "proxies",
  helpers,
  cases: [
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
