import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import * as _chains from "wagmi/chains";
import type { Chain, Transport } from "viem";

import { safe } from "./overrides/safe";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;

const isIframe = window.self !== window.top;

function alchemyUrl(alchemyChain: string) {
  return `https://${alchemyChain}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

const alchemyTransports = ALCHEMY_API_KEY && {
  [_chains.mainnet.id]: alchemyUrl(`eth-mainnet`),
  [_chains.sepolia.id]: alchemyUrl(`eth-sepolia`),
  [_chains.polygon.id]: alchemyUrl(`polygon-mainnet`),
  [_chains.polygonAmoy.id]: alchemyUrl(`polygon-amoy`),
  [_chains.polygonZkEvm.id]: alchemyUrl(`polygonzkevm-mainnet`),
  [_chains.polygonZkEvmCardona.id]: alchemyUrl(`polygonzkevm-cardona`),
  [_chains.optimism.id]: alchemyUrl(`opt-mainnet`),
  [_chains.optimismSepolia.id]: alchemyUrl(`opt-sepolia`),
  [_chains.arbitrum.id]: alchemyUrl(`arb-mainnet`),
  [_chains.arbitrumSepolia.id]: alchemyUrl(`arb-sepolia`),
  [_chains.base.id]: alchemyUrl(`base-mainnet`),
  [_chains.baseSepolia.id]: alchemyUrl(`base-sepolia`),
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
