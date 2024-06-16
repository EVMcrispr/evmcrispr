import { createConfig, http } from 'wagmi';
import { injected, safe, walletConnect } from 'wagmi/connectors';
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
    walletConnect({
      projectId:
        import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
        '6618ed719d2018be97a319ea889e730d',
    }),
    safe(),
  ],
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
