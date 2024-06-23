import { useEffect, useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import type { Connector } from 'wagmi';
import type { SafeInfo } from '@safe-global/safe-apps-sdk';
import SafeAppsSDK from '@safe-global/safe-apps-sdk';

export function useSafeConnection() {
  const [sdk, setSdk] = useState<SafeAppsSDK | undefined>(undefined);
  const [safe, setSafe] = useState<SafeInfo | undefined>(undefined);
  const { connector: activeConnector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const isSafe = activeConnector?.id === 'safe';
  useEffect(() => {
    const safeConnector = connectors.find((c: Connector) => c.id === 'safe');
    if (safeConnector && !isSafe && window.parent !== window) {
      connectAsync({ connector: safeConnector })
        .then(() => {
          safeConnector.getProvider().then((provider) => {
            setSdk(new SafeAppsSDK((provider as any).sdk));
            setSafe((provider as any).safe);
          });
        })
        .catch(() => {
          console.log('error connecting to safe');
        });
    }
  }, [connectors, connectAsync, activeConnector?.id, isSafe]);

  return { isSafe, sdk, safe };
}
