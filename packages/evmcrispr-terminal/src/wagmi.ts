import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';

import {
  arbitrum,
  gnosis,
  goerli,
  mainnet,
  optimism,
  polygon,
  polygonZkEvm,
  sepolia,
} from 'wagmi/chains';

import { safe } from './overrides/safe';

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const config = createConfig({
  chains: [
    mainnet,
    sepolia,
    goerli,
    gnosis,
    polygon,
    polygonZkEvm,
    optimism,
    arbitrum,
  ],
  connectors: [
    injected(),
    WALLETCONNECT_PROJECT_ID &&
      walletConnect({
        projectId: WALLETCONNECT_PROJECT_ID,
      }),
    safe({
      allowedDomains: [/app.safe.global$/],
      shimDisconnect: true,
    }),
  ].filter(Boolean),
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [goerli.id]: http(),
    [gnosis.id]: http(),
    [polygon.id]: http(),
    [polygonZkEvm.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
  },
});
