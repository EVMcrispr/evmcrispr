import { useConnect } from 'wagmi';
import { useEffect } from 'react';

const AUTOCONNECTED_CONNECTOR_IDS = ['safe'];

function useSafeAutoConnect() {
  const { connectAsync, connectors } = useConnect();

  useEffect(() => {
    AUTOCONNECTED_CONNECTOR_IDS.forEach((connector) => {
      const connectorInstance = connectors.find((c) => c.id === connector);

      if (connectorInstance) {
        connectAsync({ connector: connectorInstance });
      }
    });
  }, [connectAsync, connectors]);
}

export { useSafeAutoConnect };
