import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import {
  arbitrum,
  base,
  gnosis,
  goerli,
  mainnet,
  optimism,
  polygon,
  polygonZkEvm,
  sepolia,
} from "wagmi/chains";

import { safe } from "./overrides/safe";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;

const isIframe = window.self !== window.top;

export const transports = ALCHEMY_API_KEY
  ? {
      [mainnet.id]: http(
        `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      ),
      [sepolia.id]: http(
        `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      ),
      [goerli.id]: http(),
      [gnosis.id]: http(),
      [polygon.id]: http(
        `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      ),
      [polygonZkEvm.id]: http(
        `https://polygonzkevm-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      ),
      [optimism.id]: http(
        `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      ),
      [arbitrum.id]: http(
        `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      ),
      [base.id]: http(
        `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      ),
    }
  : {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
      [goerli.id]: http(),
      [gnosis.id]: http(),
      [polygon.id]: http(),
      [polygonZkEvm.id]: http(),
      [optimism.id]: http(),
      [arbitrum.id]: http(),
      [base.id]: http(),
    };

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
