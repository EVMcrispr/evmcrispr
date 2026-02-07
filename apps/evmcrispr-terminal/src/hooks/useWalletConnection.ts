import { useCallback, useEffect, useState } from "react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { terminalStoreActions } from "../stores/terminal-store";

const AUTOCONNECTED_CONNECTOR_IDS = ["safe"];

export function useWalletConnection() {
  const { address, connector: activeConnector } = useAccount();
  const { connect, connectAsync, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();

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
    terminalStoreActions("errors", []);
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
