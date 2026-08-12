import "../../setup";
import { afterAll, beforeAll } from "bun:test";
import { decode, getCodec } from "@ensdomains/content-hash";
import type { Num } from "@evmcrispr/sdk";
import { expect, resetAnvil } from "@evmcrispr/test-utils";
import {
  describeParity,
  getMainnetForkTransports,
} from "@evmcrispr/test-utils/onchain";
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { anvilUrl } from "../../../../../scripts/anvil-config";
import { helpers } from "../../../src/_generated";
import { decodeFuses } from "../../../src/fuses";

/**
 * @ens by value, on a mainnet fork.
 *
 * The on-chain faces refuse anywhere but chain 1, so this is the only place
 * they can be compared at all — and it is worth comparing, because the plain
 * faces resolve through a dedicated mainnet client while the `!` faces
 * staticcall the registry, two genuinely different routes to the same answer.
 *
 * Both faces are pointed at the SAME node: without the transport override the
 * off-chain side would read DRPC at head while the on-chain side reads the
 * fork, and any name whose record changed between the two would look like a
 * parity bug.
 */

const NAME = "vitalik.eth";
/** Wrapped at the fork block (NameWrapper getData shows burned fuses). */
const WRAPPED = "jefflau.eth";
/** vitalik.eth's forward-consistent reverse record. */
const VITALIK_ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
/** Anvil account #0 — no reverse record on mainnet. */
const NO_REVERSE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
/** Registered by nobody, so its resolver is the zero address. */
const UNREGISTERED = "this-name-is-not-registered-xyz.eth";
const client = createPublicClient({
  chain: mainnet,
  transport: http(anvilUrl()),
}) as PublicClient;

beforeAll(async () => {
  // Point the shared anvil at mainnet; ENS lives nowhere else.
  await resetAnvil(1);
}, 60_000);

afterAll(async () => {
  // Restore the pinned gnosis fork for whatever runs next in this package.
  await resetAnvil();
}, 60_000);

describeParity("@ens", {
  module: "ens",
  helpers,
  chainId: mainnet.id,
  transports: getMainnetForkTransports(),
  client,
  cases: [
    {
      name: "owner of a registered name",
      run: `@ens:owner(${NAME})`,
      compile: `@ens:owner!(${NAME})`,
    },
    {
      name: "resolver of a registered name",
      run: `@ens:resolver(${NAME})`,
      compile: `@ens:resolver!(${NAME})`,
    },
    {
      name: "addr resolves a name to an address",
      run: `@ens:addr(${NAME})`,
      compile: `@ens:addr!(${NAME})`,
    },
    {
      name: "expiry of a registered .eth name",
      run: `@ens:expiry(${NAME})`,
      compile: `@ens:expiry!(${NAME})`,
    },
    {
      name: "available is false for a registered name",
      run: `@ens:available(${NAME})`,
      compile: `@ens:available!(${NAME})`,
    },
    {
      name: "text record of a name that has it",
      run: `@ens:text(${NAME} url)`,
      compile: `@ens:text!(${NAME} url)`,
    },
    {
      // An unregistered name has no resolver: the plain face errors, the
      // on-chain cond falls back to the empty string.
      name: "text of an unresolvable name: plain errors, face reads empty",
      run: `@ens:text(${UNREGISTERED} url)`,
      compile: `@ens:text!(${UNREGISTERED} url)`,
      runThrows: /no text record/,
    },
    {
      name: "rentPrice sums base and premium across faces",
      run: `@ens:rentPrice(${NAME} 1y)`,
      compile: `@ens:rentPrice!(${NAME} 1y)`,
    },
    {
      // vitalik.eth's reverse record forward-resolves consistently, so the
      // face's skipped forward check is invisible here.
      name: "name reverse-resolves a consistent primary name",
      run: `@ens:name(${VITALIK_ADDR})`,
      compile: `@ens:name!(${VITALIK_ADDR})`,
    },
    {
      name: "name of an address with no reverse record: plain errors, face reads empty",
      run: `@ens:name(${NO_REVERSE})`,
      compile: `@ens:name!(${NO_REVERSE})`,
      runThrows: /no primary ENS name/,
    },
    {
      name: "fuses.of reads the raw bitmap where plain decodes names",
      run: `@ens:fuses.of(${WRAPPED})`,
      compile: `@ens:fuses.of!(${WRAPPED})`,
      helper: "fuses.of",
      diverges: {
        reason: "raw uint32 bitmap vs decoded fuse names",
        expect: (run, chain) => {
          const bitmap = Number((chain.v as Num).toBigInt());
          const names = (run.v as { v: unknown }[]).map((n) => n.v);
          expect(decodeFuses(bitmap)).to.deep.equal(names);
        },
      },
    },
    {
      name: "fuses.of of an unwrapped name: plain errors, face reads 0",
      run: `@ens:fuses.of(${NAME})`,
      compile: `@ens:fuses.of!(${NAME})`,
      runThrows: /is not wrapped/,
    },
    {
      name: "contenthash.of reads raw multicodec bytes where plain decodes a URI",
      run: `@ens:contenthash.of(${NAME})`,
      compile: `@ens:contenthash.of!(${NAME})`,
      helper: "contenthash.of",
      diverges: {
        reason: "raw encoded content hash bytes vs decoded URI",
        expect: (run, chain) => {
          const encoded = String(chain.v).slice(2);
          expect(`${getCodec(encoded)}://${decode(encoded)}`).to.equal(run.v);
        },
      },
    },
    {
      name: "contenthash of an unresolvable name: plain errors, face reads empty bytes",
      run: `@ens:contenthash.of(${UNREGISTERED})`,
      compile: `@ens:contenthash.of!(${UNREGISTERED})`,
      runThrows: /no content hash|no resolver/,
    },
  ],
});
