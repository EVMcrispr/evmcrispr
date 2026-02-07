import { useEffect, useState } from "react";
import type { Connector } from "wagmi";

export function useWalletConnect({
  walletConnectConnector,
  onConnect,
}: {
  walletConnectConnector: Connector | undefined;
  onConnect: () => void;
}) {
  const [wcUri, setWcUri] = useState<string | null>(null);

  const handleMessage = (message: { type: string; data?: unknown }) => {
    if (message.type === "display_uri" && typeof message.data === "string") {
      setWcUri(message.data);
    }
  };

  useEffect(() => {
    walletConnectConnector?.emitter.on("message", handleMessage);
    return () => {
      walletConnectConnector?.emitter.off("message", handleMessage);
    };
  }, [walletConnectConnector, handleMessage]);

  useEffect(() => {
    walletConnectConnector?.emitter.on("connect", onConnect);
    return () => {
      walletConnectConnector?.emitter.off("connect", onConnect);
    };
  }, [walletConnectConnector, onConnect]);

  return { wcUri, setWcUri };
}
