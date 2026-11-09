/**
 * Chain and RPC endpoint configuration, kept free of browser globals so it
 * can be imported from the EVML Web Worker (wagmi.ts touches `window` at
 * module scope and must stay main-thread only).
 */
import type { ChainDef, ModuleChainDef } from "@evmcrispr/core";
import { isChainGatewayDef, toViemChain } from "@evmcrispr/core";
import {
  experimentalModuleChains,
  moduleChains,
} from "@evmcrispr/modules/chains";
import { isExperimentalEnabled } from "@evmcrispr/sdk";
import { ALT_MEMPOOL_GATEWAY, altMempoolDevnet } from "@evmcrispr/viem-frames";
import type { Chain, Transport } from "viem";
import { defineChain, http } from "viem";
import {
  abstract,
  apeChain,
  arbitrum,
  arbitrumNova,
  arbitrumSepolia,
  arcTestnet,
  aurora,
  avalanche,
  base,
  baseSepolia,
  berachain,
  bitTorrent,
  blast,
  bob,
  boba,
  bsc,
  celo,
  coreDao,
  cronos,
  cronoszkEVM,
  fantom,
  gnosis,
  gnosisChiado,
  harmonyOne,
  hashkey,
  hemi,
  immutableZkEvm,
  ink,
  katana,
  kava,
  klaytn,
  kroma,
  linea,
  lisk,
  mainnet,
  manta,
  mantle,
  megaeth,
  merlin,
  metalL2,
  metis,
  moonbeam,
  moonriver,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  polygonZkEvm,
  polygonZkEvmCardona,
  scroll,
  sepolia,
  telos,
  tempo,
  thunderCore,
  unichain,
  viction,
  wemix,
  worldchain,
  xLayer,
  zeroGMainnet,
  zeroNetwork,
  zetachain,
  zircuit,
  zksync,
  zora,
} from "viem/chains";
import { applyBrowserUrlPolicy, browserSafeUrl } from "./browserSafeUrl";

const DRPC_API_KEY = import.meta.env.VITE_DRPC_API_KEY;

function drpcUrl(drpcChain: string) {
  return `https://lb.drpc.live/${drpcChain}/${DRPC_API_KEY}`;
}

const hyperliquid = defineChain({
  id: 999,
  name: "Hyperliquid",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

const mezo = defineChain({
  id: 31612,
  name: "Mezo",
  nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

const moca = defineChain({
  id: 2288,
  name: "Moca",
  nativeCurrency: { name: "MOCA", symbol: "MOCA", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

const chainConfig: [Chain, string][] = [
  [mainnet, `ethereum`],
  [bsc, `bsc`],
  [polygon, `polygon`],
  [arbitrum, `arbitrum`],
  [optimism, `optimism`],
  [zksync, `zksync`],
  [linea, `linea`],
  [base, `base`],
  [fantom, `fantom`],
  [avalanche, `avalanche`],
  [gnosis, `gnosis`],
  [scroll, `scroll`],
  [mantle, `mantle`],
  [arbitrumNova, `arbitrum-nova`],
  [aurora, `aurora`],
  [polygonZkEvm, `polygon-zkevm`],
  [klaytn, `klaytn`],
  [zeroGMainnet, `0g-mainnet`],
  [abstract, `abstract`],
  [apeChain, `apechain`],
  [arcTestnet, `arc-testnet`],
  [berachain, `berachain`],
  [bitTorrent, `bittorrent`],
  [blast, `blast`],
  [bob, `bob`],
  [boba, `boba-eth`],
  [celo, `celo`],
  [coreDao, `core`],
  [cronos, `cronos`],
  [cronoszkEVM, `cronos-zkevm`],
  [harmonyOne, `harmony-0`],
  [hashkey, `hashkey`],
  [hemi, `hemi`],
  [hyperliquid, `hyperliquid`],
  [immutableZkEvm, `immutable-zkevm`],
  [ink, `ink`],
  [katana, `katana`],
  [kava, `kava`],
  [kroma, `kroma`],
  [lisk, `lisk`],
  [manta, `manta-pacific`],
  [megaeth, `megaeth`],
  [merlin, `merlin`],
  [metalL2, `metall2`],
  [metis, `metis`],
  [mezo, `mezo`],
  [moca, `moca`],
  [moonbeam, `moonbeam`],
  [moonriver, `moonriver`],
  [telos, `telos`],
  [tempo, `tempo-mainnet`],
  [thunderCore, `thundercore`],
  [unichain, `unichain`],
  [viction, `viction`],
  [wemix, `wemix`],
  [worldchain, `worldchain`],
  [xLayer, `xlayer`],
  [zeroNetwork, `zero`],
  [zetachain, `zeta-chain`],
  [zircuit, `zircuit-mainnet`],
  [zora, `zora`],
  // Testnets
  [sepolia, `sepolia`],
  [polygonAmoy, `polygon-amoy`],
  [polygonZkEvmCardona, `polygon-zkevm-cardona`],
  [optimismSepolia, `optimism-sepolia`],
  [arbitrumSepolia, `arbitrum-sepolia`],
  [baseSepolia, `base-sepolia`],
  [gnosisChiado, `gnosis-chiado`],
];

applyBrowserUrlPolicy();

/** Chains shipped by modules (`src/chains.ts`), minus any the DRPC list
 *  already covers. They bring their own RPC, so no key is needed. */
const moduleExtraChains: ChainDef[] = (moduleChains as ModuleChainDef[])
  .filter((def): def is ChainDef => !isChainGatewayDef(def))
  .filter((def) => !chainConfig.some(([chain]) => chain.id === def.id))
  .map((def) => ({ ...def, rpcUrl: browserSafeUrl(def.rpcUrl) }));

/** The alt-mempool devnet (EIP-8141 frame transactions), through its
 *  gateway. Chain 1337 is also every local devnet's id, so it is never a
 *  module chain: only the terminal declares it, and only with the
 *  experimental flag on. Without it, 1337 stays viem's localhost. */
const altMempoolChain: ChainDef = {
  id: altMempoolDevnet.id,
  key: "altMempoolDevnet",
  name: altMempoolDevnet.name,
  rpcUrl: ALT_MEMPOOL_GATEWAY,
  nativeCurrency: altMempoolDevnet.nativeCurrency,
  explorerUrl: altMempoolDevnet.blockExplorers.default.url,
  testnet: true,
};

/** A plain local anvil, for the test wallet (experimental): its accounts are
 *  the test wallet's, and its RPC is on this machine. */
const localAnvilChain: ChainDef = {
  id: 31337,
  key: "localAnvil",
  name: "Local anvil",
  rpcUrl: "http://127.0.0.1:8545",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  testnet: true,
};

/** Chain ids that only experimental modules declare. */
const experimentalChainIds = new Set(
  experimentalModuleChains.map((def) => def.id),
);

/** The terminal's networks, with or without the experimental ones (the
 *  alt-mempool devnet, a local anvil and the chains experimental modules
 *  declare). */
export function networks(experimental: boolean) {
  const extraChains = experimental
    ? [...moduleExtraChains, altMempoolChain, localAnvilChain]
    : moduleExtraChains.filter((def) => !experimentalChainIds.has(def.id));

  const chains = [
    ...chainConfig.map(([chain]) => chain),
    ...extraChains.map(toViemChain),
  ] as [Chain, ...Chain[]];

  /** chainId → RPC URL. Serializable — this is what crosses into the EVML
   *  worker. Without a DRPC key only module-shipped chains have a URL
   *  (viem default transports apply to the rest). */
  const rpcUrls: Record<number, string> = {
    ...Object.fromEntries(extraChains.map((def) => [def.id, def.rpcUrl])),
    ...(DRPC_API_KEY
      ? Object.fromEntries(
          chainConfig.map(([chain, slug]) => [chain.id, drpcUrl(slug)]),
        )
      : {}),
  };

  const transports = chains.reduce(
    (acc, { id }) => {
      acc[id] = rpcUrls[id] ? http(rpcUrls[id]) : http();
      return acc;
    },
    {} as Record<number, Transport>,
  );

  return { chains, rpcUrls, transports };
}

export const { chains, rpcUrls, transports } = networks(
  isExperimentalEnabled(),
);
