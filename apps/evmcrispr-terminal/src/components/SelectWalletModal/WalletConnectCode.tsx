import { QRCodeSVG } from "qrcode.react";
import type { Connector } from "wagmi";

import CopyCode from "./CopyCode";
import { useWalletConnect } from "../../hooks/useWalletConnect";

const GREEN_300 = "#8CF467";

export default function WalletConnectCode({
  walletConnectConnector,
  onConnect,
}: {
  walletConnectConnector: Connector;
  onConnect: () => void;
}) {
  const { wcUri } = useWalletConnect({
    walletConnectConnector,
    onConnect,
  });

  return wcUri ? (
    <>
      <QRCodeSVG
        value={wcUri}
        size={400}
        bgColor="black"
        fgColor={GREEN_300}
        marginSize={8}
        level="H"
        imageSettings={{
          src: "/walletconnect-logo.svg",
          height: 48,
          width: 48,
          excavate: true,
        }}
      />
      <CopyCode code={wcUri} />
    </>
  ) : null;
}
