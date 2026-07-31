import { useCallback, useEffect, useState } from "react";
import type { Connector } from "wagmi";
import {
  useChainId,
  useChains,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
} from "wagmi";

const AUTOCONNECTED_CONNECTOR_IDS = ["safe"];

export function useWalletConnection() {
  const { address, connector: activeConnector } = useConnection();
  const { mutate: connect, mutateAsync: connectAsync } = useConnect();
  const { mutate: wagmiDisconnect } = useDisconnect();
  const connectors = useConnectors();
  const chainId = useChainId();
  const chains = useChains();

  const [isWalletModalOpen, setWalletModalOpen] = useState(false);

  const safeConnector = connectors.find((c: Connector) => c.id === "safe");
  const isSafe = activeConnector?.id === "safe";
  const safeConnectorInstance = isSafe ? activeConnector : undefined;

  // Auto-connect Safe when running inside an iframe
  useEffect(() => {
    AUTOCONNECTED_CONNECTOR_IDS.forEach((connector) => {
      const connectorInstance = connectors.find((c) => c.id === connector);
      if (connectorInstance) {
        connectAsync({ connector: connectorInstance });
      }
    });
  }, [connectAsync, connectors]);

  const openWalletModal = useCallback(() => {
    setWalletModalOpen(true);
  }, []);

  const closeWalletModal = useCallback(() => {
    setWalletModalOpen(false);
  }, []);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  const connectWallet = useCallback(() => {
    if (safeConnector) {
      connect({ connector: safeConnector });
    } else {
      setWalletModalOpen(true);
    }
  }, [safeConnector, connect]);

  return {
    address,
    chainId,
    chainName: chains.find((chain) => chain.id === chainId)?.name,
    isSafe,
    safeConnector,
    safeConnectorInstance,
    isWalletModalOpen,
    openWalletModal,
    closeWalletModal,
    disconnect,
    connectWallet,
  };
}
