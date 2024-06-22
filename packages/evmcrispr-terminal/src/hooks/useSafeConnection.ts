import { useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk';

export function useSafeConnection() {
  const { address, connector: activeConnector } = useAccount();
  const { safe, connected: isSafe } = useSafeAppsSDK();
  const { connectors, connectAsync } = useConnect();

  useEffect(() => {
    if (
      isSafe &&
      address !== safe.safeAddress &&
      activeConnector?.id !== 'safe'
    ) {
      const safeConnector = connectors.find((c) => c.id === 'safe');
      if (safeConnector) {
        connectAsync({ connector: safeConnector });
      }
    }
  }, [isSafe, connectors, address]);

  return { isSafe };
}
