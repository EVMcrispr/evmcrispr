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
 * OP Mainnet's OptimismPortal on Ethereum: an Optimism `Proxy` whose admin
 * is Optimism's ProxyAdmin. The proxy answers `implementation()` to its
 * admin and to address zero (an eth_call), and forwards everyone else to
 * the implementation, which has no such function. So a check written from
 * an eth_call held off-chain and reverted on-chain, where the caller is the
 * Assertions core. Asked through the ProxyAdmin, it holds on both.
 */
const OPTIMISM_PORTAL = "0xbEb5Fc579115071764c7423A4f12eDde41f106Ed";

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

describeParity("@proxies on OP Mainnet's L1 contracts", {
  module: "proxies",
  helpers,
  chainId: mainnet.id,
  transports: getMainnetForkTransports(),
  client,
  cases: [
    {
      name: "the OptimismPortal's implementation, through its ProxyAdmin",
      run: `@proxies:implementation(${OPTIMISM_PORTAL})`,
      compile: `@proxies:implementation!(${OPTIMISM_PORTAL})`,
    },
  ],
});
