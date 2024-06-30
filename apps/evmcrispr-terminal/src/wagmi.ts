import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import * as _chains from "wagmi/chains";
import type { Chain, Transport } from "viem";

import { safe } from "./overrides/safe";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;

const isIframe = window.self !== window.top;

const alchemyTransports = ALCHEMY_API_KEY && {
  [_chains.mainnet.id]:
    `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.sepolia.id]:
    `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.polygon.id]:
    `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.polygonAmoy.id]:
    `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.polygonZkEvm.id]:
    `https://polygonzkevm-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.polygonZkEvmCardona.id]:
    `https://polygonzkevm-cardona.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.optimism.id]:
    `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.optimismSepolia.id]:
    `https://opt-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.arbitrum.id]:
    `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.arbitrumSepolia.id]:
    `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.base.id]: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  [_chains.baseSepolia.id]:
    `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
};
const chains = Object.values(_chains) as unknown as [Chain, ...Chain[]];
export const transports = chains.reduce(
  (acc, { id }) => {
    acc[id] = alchemyTransports?.[id] ? http(alchemyTransports[id]) : http();
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
      }),
    isIframe &&
      safe({
        allowedDomains: [/app.safe.global$/],
        unstable_getInfoTimeout: 500,
      }),
  ].filter(Boolean),
  transports,
});
