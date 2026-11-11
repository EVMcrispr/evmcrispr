import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @proxies' both-faced helpers, and the cases where the two faces genuinely
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

/** A slot-only proxy: an implementation in its ERC-1967 slot, no admin,
 *  and code that reverts on every call, so no getter and no beacon. */
const SLOT_ONLY = "0x00000000000000000000000000000000005a1702";
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/** Constant mock feeding the live-salt case. */
const SALT_MOCK = "0x00000000000000000000000000000000005a1701";
const SALT =
  "0x00000000000000000000000000000000000000000000000000000000000000aa";

describeParity("@proxies", {
  module: "proxies",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      SALT_MOCK,
      encodeAbiParameters([{ type: "bytes32" }], [SALT]),
    );
    await client.request({
      method: "anvil_setCode" as never,
      params: [SLOT_ONLY, "0x60006000fd"] as never,
    });
    await client.request({
      method: "anvil_setStorageAt" as never,
      params: [
        SLOT_ONLY,
        IMPLEMENTATION_SLOT,
        encodeAbiParameters([{ type: "address" }], [GNO]),
      ] as never,
    });
  },
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
      // A transparent proxy answers implementation() only to its admin.
      // TokenDistro's admin is a ProxyAdmin that reports it, so the
      // on-chain face asks the admin and the two faces agree.
      name: "a transparent proxy is read through its ProxyAdmin",
      run: `@proxies:implementation(${TOKEN_DISTRO})`,
      compile: `@proxies:implementation!(${TOKEN_DISTRO})`,
    },
    {
      // No getter, no beacon, no admin to ask: only the slot knows, and a
      // contract cannot read another's storage, so the on-chain face
      // reverts at judgement time.
      name: "reverts: a slot-only proxy with no admin to ask",
      run: `@proxies:implementation(${SLOT_ONLY})`,
      compile: `@proxies:implementation!(${SLOT_ONLY})`,
      helper: "implementation",
      reverts: /revert/i,
    },
    {
      // The admin lives in a slot the transparent proxy shows to no one but
      // that admin: the plain face reads the slot, the on-chain face has
      // only `admin()` to call, and it reverts.
      name: "reverts: a transparent proxy hides its admin from everyone else",
      run: `@proxies:admin(${TOKEN_DISTRO})`,
      compile: `@proxies:admin!(${TOKEN_DISTRO})`,
      helper: "admin",
      reverts: /revert/i,
    },
  ],
});
