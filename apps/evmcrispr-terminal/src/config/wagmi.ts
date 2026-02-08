import type { Chain, Transport } from "viem";
import { createConfig, http } from "wagmi";

import * as _chains from "wagmi/chains";
import { injected, safe, walletConnect } from "wagmi/connectors";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const DRPC_API_KEY = import.meta.env.VITE_DRPC_API_KEY;
const isIframe = window.self !== window.top;

function alchemyUrl(alchemyChain: string) {
  return `https://${alchemyChain}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

function drpcUrl(drpcChain: string) {
  return `https://lb.drpc.org/ogrpc?network=${drpcChain}&dkey=${DRPC_API_KEY}`;
}

const alchemyTransports: Record<number, string> | undefined = ALCHEMY_API_KEY
  ? {
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
    }
  : undefined;

const dRPCTransports: Record<number, string> | undefined = DRPC_API_KEY
  ? {
      [_chains.mainnet.id]: drpcUrl(`ethereum`),
      [_chains.sepolia.id]: drpcUrl(`sepolia`),
      [_chains.polygon.id]: drpcUrl(`polygon`),
      [_chains.polygonAmoy.id]: drpcUrl(`polygon-amoy`),
      [_chains.polygonZkEvm.id]: drpcUrl(`polygon-zkevm`),
      [_chains.polygonZkEvmCardona.id]: drpcUrl(`polygon-zkevm-cardona`),
      [_chains.optimism.id]: drpcUrl(`optimism`),
      [_chains.optimismSepolia.id]: drpcUrl(`optimism-sepolia`),
      [_chains.arbitrum.id]: drpcUrl(`arbitrum`),
      [_chains.arbitrumSepolia.id]: drpcUrl(`arbitrum-sepolia`),
      [_chains.base.id]: drpcUrl(`base`),
      [_chains.baseSepolia.id]: drpcUrl(`base-sepolia`),
    }
  : undefined;

const chains = Object.values(_chains) as unknown as [Chain, ...Chain[]];
export const transports = chains.reduce(
  (acc, { id }) => {
    acc[id] = alchemyTransports?.[id]
      ? http(alchemyTransports[id])
      : dRPCTransports?.[id]
        ? http(dRPCTransports[id])
        : http();
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
