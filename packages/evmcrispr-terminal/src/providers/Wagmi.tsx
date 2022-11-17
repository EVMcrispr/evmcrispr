import { InfuraProvider, JsonRpcProvider } from '@ethersproject/providers';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { WagmiProvider, allChains, createClient } from 'wagmi';
import type { Connector } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { ethers } from 'ethers';
import '../walletconnect-compat';

const CHAIN_WHITELIST = [1, 3, 4, 5, 100, 137];
const INFURA_ID = import.meta.env.VITE_INFURA_ID;

const chains = [
  ...allChains.filter((chain) => CHAIN_WHITELIST.includes(chain.id)),
  {
    id: 100,
    name: 'Gnosis Chain',
    nativeCurrency: { name: 'xDai', symbol: 'xDAI', decimals: 18 },
    rpcUrls: { default: 'https://rpc.gnosischain.com' },
    blockExplorers: {
      default: {
        name: 'Blockscout',
        url: 'https://blockscout.com',
      },
      etherscan: {
        name: 'Blockscout',
        url: 'https://blockscout.com',
      },
    },
  },
];

const getConnectors = (): Connector[] => {
  return [
    new InjectedConnector({
      chains,
      options: { shimDisconnect: true },
    }),
    new WalletConnectConnector({
      chains,
      options: {
        infuraId: INFURA_ID,
        qrcode: true,
      },
    }),
  ];
};

const getProvider = ({
  chainId,
}: {
  chainId?: number;
  connector?: Connector;
}) => {
  if (chainId && CHAIN_WHITELIST.includes(chainId)) {
    if (chainId == 100) {
      return new JsonRpcProvider('https://rpc.gnosischain.com', chainId);
    } else {
      return new InfuraProvider(chainId, INFURA_ID);
    }
  }
  return ethers.getDefaultProvider();
};

export default function Wagmi({ children }: { children: ReactNode }) {
  const client = useMemo(
    () =>
      createClient({
        autoConnect: true,
        connectors() {
          return getConnectors();
        },
        provider(config) {
          return getProvider(config);
        },
      }),
    [],
  );
  return <WagmiProvider client={client}>{children}</WagmiProvider>;
}
