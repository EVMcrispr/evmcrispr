import { useEffect } from "react";
import { useConnect, useConnectors } from "wagmi";

const AUTOCONNECTED_CONNECTOR_IDS = ["safe"];

function useSafeAutoConnect() {
  const { mutateAsync: connectAsync } = useConnect();
  const connectors = useConnectors();

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
