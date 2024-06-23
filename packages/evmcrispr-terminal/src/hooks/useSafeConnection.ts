import { useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
import type { Connector } from 'wagmi';

export function useSafeConnection() {
  const { connector: activeConnector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const isSafe = activeConnector?.id === 'safe';
  useEffect(() => {
    const safeConnector = connectors.find((c: Connector) => c.id === 'safe');
    if (safeConnector && !isSafe && window.parent !== window) {
      connectAsync({ connector: safeConnector }).catch(() => {
        console.log('error connecting to safe');
      });
    }
  }, [connectors, connectAsync, activeConnector, isSafe]);

  return { isSafe };
}
