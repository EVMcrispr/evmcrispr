import type { Chain, Transport } from "viem";
import { defineChain } from "viem";
import { createConfig, http } from "wagmi";

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
} from "wagmi/chains";
import { injected, safe, walletConnect } from "wagmi/connectors";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const DRPC_API_KEY = import.meta.env.VITE_DRPC_API_KEY;
const isIframe = window.self !== window.top;

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
];

const chains = chainConfig.map(([chain]) => chain) as [Chain, ...Chain[]];

export const transports = chains.reduce(
  (acc, { id }) => {
    const slug = chainConfig.find(([c]) => c.id === id)?.[1];
    acc[id] = slug && DRPC_API_KEY ? http(drpcUrl(slug)) : http();
    return acc;
  },
  {} as Record<number, Transport>,
);

export const config = createConfig({
  chains,
  connectors: [
    !isIframe && injected(),
    !isIframe &&
      WALLETCONNECT_PROJECT_ID &&
      walletConnect({
        projectId: WALLETCONNECT_PROJECT_ID,
        showQrModal: false,
      }),
    isIframe &&
      safe({
        allowedDomains: [/app.safe.global$/],
        unstable_getInfoTimeout: 500,
      }),
  ].filter((c): c is Exclude<typeof c, false | "" | undefined> => Boolean(c)),
  transports,
});
