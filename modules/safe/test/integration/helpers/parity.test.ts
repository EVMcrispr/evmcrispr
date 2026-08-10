import "../../setup";
import { afterAll, beforeAll } from "bun:test";
import { resetAnvil } from "@evmcrispr/test-utils";
import {
  describeParity,
  getMainnetForkTransports,
} from "@evmcrispr/test-utils/onchain";
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { anvilUrl } from "../../../../../scripts/anvil-config";
import { helpers } from "../../../src/_generated";

/**
 * @safe against a REAL Safe: giv.eth on mainnet.
 *
 * This replaces a set of constant-returning mocks. A mock could only ever
 * show that both faces issue the same call and decode the bytes the same way;
 * against a live Safe the answers have to match something neither face
 * controls, and two of these helpers could not be covered by a mock at all:
 * `@guard` decoded differently on the two faces against fabricated slot
 * bytes, and `@modules` walks pages until `next` is zero, which never
 * terminates against a mock that answers every page identically.
 *
 * `@isOwner` is the one that most needed a real subject: the plain face SCANS
 * getOwners() while the ! face asks isOwner() directly, so the two routes
 * agree here only because the Safe is consistent about its own membership.
 */

/** giv.eth. Resolved once and pinned, so the suite does not depend on the
 *  name still pointing here. */
const SAFE = "0x4D9339dd97db55e3B9bCBE65dE39fF9c04d1C2cd";
/** An owner of that Safe at the fork block. */
const OWNER = "0xb411b1D939606198f6cbccD38496879d27937ff0";
/** Never an owner: the all-ones address. */
const STRANGER = "0x1111111111111111111111111111111111111111";

const client = createPublicClient({
  chain: mainnet,
  transport: http(anvilUrl()),
}) as PublicClient;

beforeAll(async () => {
  await resetAnvil(1);
}, 60_000);

afterAll(async () => {
  // Restore the pinned gnosis fork for whatever runs next in this package.
  await resetAnvil();
}, 60_000);

describeParity("@safe", {
  module: "safe",
  helpers,
  chainId: mainnet.id,
  transports: getMainnetForkTransports(),
  client,
  cases: [
    {
      name: "threshold of a live Safe",
      run: `@safe:threshold(${SAFE})`,
      compile: `@safe:threshold!(${SAFE})`,
    },
    {
      name: "nonce of a live Safe",
      run: `@safe:nonce(${SAFE})`,
      compile: `@safe:nonce!(${SAFE})`,
    },
    {
      // The ! face re-frames the getOwners envelope as a words payload, so
      // this pins that the re-framing lands on the same addresses.
      name: "owners of a live Safe",
      run: `@safe:owners(${SAFE})`,
      compile: `@safe:owners!(${SAFE})`,
      decodeAs: "address[]",
    },
    {
      // A scan against a direct call, on a Safe with a dozen owners.
      name: "isOwner is true whether scanned or asked directly",
      run: `@safe:isOwner(${OWNER} ${SAFE})`,
      compile: `@safe:isOwner!(${OWNER} ${SAFE})`,
    },
    {
      // The direction where a scan and a call are most likely to part company.
      name: "isOwner is false for an address that is not an owner",
      run: `@safe:isOwner(${STRANGER} ${SAFE})`,
      compile: `@safe:isOwner!(${STRANGER} ${SAFE})`,
    },
    {
      // No guard set, so both faces must agree on the zero address rather
      // than one of them inventing a value out of an empty slot.
      name: "guard of a Safe with none set",
      run: `@safe:guard(${SAFE})`,
      compile: `@safe:guard!(${SAFE})`,
    },
    {
      // The ! face reads ONE page; the plain face walks until `next` is zero.
      // They agree when a single page holds them all, which the
      // compileDescription says is the limit.
      name: "modules of a live Safe",
      run: `@safe:modules(${SAFE})`,
      compile: `@safe:modules!(${SAFE})`,
      decodeAs: "address[]",
    },
  ],
});
