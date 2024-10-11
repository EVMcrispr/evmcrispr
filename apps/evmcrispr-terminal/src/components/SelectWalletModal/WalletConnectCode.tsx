import { useTheme } from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";

import type { Connector } from "wagmi";

import CopyCode from "./CopyCode";
import { useWalletConnect } from "../../hooks/useWalletConnect";

export default function WalletConnectCode({
  walletConnectConnector,
  onConnect,
}: {
  walletConnectConnector: Connector;
  onConnect: () => void;
}) {
  const { green } = useTheme().colors;
  const { wcUri } = useWalletConnect({
    walletConnectConnector,
    onConnect,
  });

  return wcUri ? (
    <>
      <QRCodeSVG
        value={wcUri}
        size={300}
        bgColor="black"
        fgColor={green[300]}
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
