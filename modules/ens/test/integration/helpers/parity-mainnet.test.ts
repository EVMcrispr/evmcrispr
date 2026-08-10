import "../../setup";
import { afterAll, beforeAll } from "bun:test";
import { resetAnvil } from "@evmcrispr/test-utils";
import {
  describeParity,
  getMainnetForkTransports,
} from "@evmcrispr/test-utils/onchain";
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { helpers } from "../../../src/_generated";

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
const client = createPublicClient({
  chain: mainnet,
  transport: http("http://127.0.0.1:8545"),
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
  ],
});
