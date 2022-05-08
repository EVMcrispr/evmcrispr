import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { WagmiProvider, allChains, createClient } from 'wagmi';
import type { Connector } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { InfuraProvider } from '@ethersproject/providers';
import { ethers } from 'ethers';

const CHAIN_WHITELIST = [1, 3, 100];
const INFURA_ID = process.env.REACT_APP_INFURA_ID;

const getConnectors = (): Connector[] => {
  const chains = allChains.filter((chain) =>
    CHAIN_WHITELIST.includes(chain.id),
  );

  return [
    new InjectedConnector({
      chains,
      options: { shimDisconnect: true },
    }),
    new WalletConnectConnector({
      chains,
      options: {
        infuraId: process.env.REACT_APP_INFURA_ID,
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
    return new InfuraProvider(chainId, INFURA_ID);
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
