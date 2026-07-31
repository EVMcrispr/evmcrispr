import { useCallback, useRef, useState } from "react";
import type { Connector } from "wagmi";
import { useConnect } from "wagmi";

type DeepLink = (uri: string) => string;

export function useWalletConnect({
  walletConnectConnector,
  onConnect,
}: {
  walletConnectConnector: Connector | undefined;
  onConnect: () => void;
}) {
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { mutateAsync: connectAsync, isPending } = useConnect();
  // Kept so the user can relaunch the wallet app if the first jump was
  // swallowed by the browser or the app was backgrounded too early.
  const deepLinkRef = useRef<DeepLink | null>(null);

  const startConnection = useCallback(
    async (deepLink?: DeepLink) => {
      if (!walletConnectConnector) return;

      setWcUri(null);
      setError(null);
      deepLinkRef.current = deepLink ?? null;

      // Listen before connecting: `display_uri` is emitted as soon as the
      // pairing is created, and on mobile we must ride that first event to
      // open the wallet app while the tap is still user-initiated.
      const handleMessage = (message: { type: string; data?: unknown }) => {
        if (message.type !== "display_uri" || typeof message.data !== "string")
          return;
        setWcUri(message.data);
        if (deepLink) window.location.href = deepLink(message.data);
      };

      walletConnectConnector.emitter.on("message", handleMessage);

      try {
        await connectAsync({ connector: walletConnectConnector });
        onConnect();
      } catch (e) {
        // Keep the QR on screen so the user can retry or pick another wallet.
        setError(e as Error);
      } finally {
        walletConnectConnector.emitter.off("message", handleMessage);
      }
    },
    [walletConnectConnector, connectAsync, onConnect],
  );

  const reopenWallet = useCallback(() => {
    if (wcUri && deepLinkRef.current) {
      window.location.href = deepLinkRef.current(wcUri);
    }
  }, [wcUri]);

  const canReopenWallet = Boolean(wcUri && deepLinkRef.current);

  return {
    wcUri,
    error,
    isPending,
    startConnection,
    reopenWallet,
    canReopenWallet,
  };
}
