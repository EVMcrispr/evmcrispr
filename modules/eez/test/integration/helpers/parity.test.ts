import "../../setup";
import { getTransports } from "@evmcrispr/test-utils";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";
import { eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS } from "../../../src/constants";
import { devnet, ensureFunded, L1_ID, l1, l1Wallet } from "../../devnet";

/**
 * `@eez:proxy!` and `@eez:target!` against the live devnet registry on L1,
 * where the Assertions core is deployed at its canonical address.
 *
 * Both are plain registry reads, so the faces agree, with one declared
 * exception: the registry answers a non-proxy with zeroes where the
 * off-chain face refuses.
 */

const DEAD = "0x000000000000000000000000000000000000dEaD";
/** A rollup address whose L1 proxy the setup below makes sure exists. */
const KNOWN = "0x000000000000000000000000000000000000bEEF";
const { registry } = EEZ_CHAINS[L1_ID];

const proxyOf = (target: `0x${string}`) =>
  l1.readContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [target, 1n],
  });

const ensureKnownProxy = async () => {
  await ensureFunded();
  const proxy = await proxyOf(KNOWN);
  const code = await l1.getCode({ address: proxy });
  if (code && code !== "0x") return;
  const hash = await l1Wallet.writeContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "createCrossChainProxy",
    args: [KNOWN, 1n],
  });
  await l1.waitForTransactionReceipt({ hash, timeout: 60_000 });
};

const knownProxy = devnet ? await proxyOf(KNOWN) : DEAD;

describeParity("@eez", {
  module: "eez",
  helpers,
  chainId: L1_ID,
  transports: getTransports(),
  client: l1,
  skip: !devnet,
  setup: ensureKnownProxy,
  cases: [
    {
      name: "proxy of a rollup contract",
      run: `@eez:proxy(eezL2 ${DEAD})`,
      compile: `@eez:proxy!(eezL2 ${DEAD})`,
    },
    {
      name: "target of a registered proxy",
      run: `@eez:target(eezL1 ${knownProxy})`,
      compile: `@eez:target!(eezL1 ${knownProxy})`,
    },
    {
      name: "round trip with a live target",
      run: `@eez:proxy(eezL2 @eez:target(eezL1 ${knownProxy}))`,
      compile: `@eez:proxy!(eezL2 @eez:target!(eezL1 ${knownProxy}))`,
    },
    {
      name: "a non-proxy resolves to the zero address instead of failing",
      helper: "target",
      run: `@eez:target(eezL1 ${DEAD})`,
      compile: `@eez:target!(eezL1 ${DEAD})`,
      runThrows: "not a cross-chain proxy",
    },
    {
      name: "refuses another chain's registry",
      helper: "target",
      run: `@eez:target(eezL2 ${DEAD})`,
      compile: `@eez:target!(eezL2 ${DEAD})`,
      refuses: "runs on",
    },
  ],
});
