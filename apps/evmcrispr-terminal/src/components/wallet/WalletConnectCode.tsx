import { Button } from "@repo/ui";
import { QRCodeSVG } from "qrcode.react";
import CopyCode from "./CopyCode";

export default function WalletConnectCode({
  wcUri,
  error,
  walletName,
  canReopenWallet,
  onReopenWallet,
}: {
  wcUri: string | null;
  error: Error | null;
  /** Set when we deep-linked into a specific wallet app. */
  walletName?: string;
  canReopenWallet: boolean;
  onReopenWallet: () => void;
}) {
  if (!wcUri) {
    return (
      <p className="m-0 font-sans text-body text-fg-muted">
        {error ? error.message : "Preparing connection..."}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {canReopenWallet && (
        <>
          <Button
            variant="neutral"
            size="lg"
            className="w-full"
            onClick={onReopenWallet}
          >
            Open {walletName ?? "wallet"}
          </Button>
          <p className="m-0 text-center font-sans text-caption text-fg-muted">
            If {walletName ?? "your wallet"} did not open, copy the link below
            and paste it there.
          </p>
        </>
      )}
      <QRCodeSVG
        value={wcUri}
        size={400}
        bgColor="var(--surface-0)"
        fgColor="var(--success)"
        marginSize={8}
        level="H"
        className="h-auto w-full max-w-[400px]"
        imageSettings={{
          src: "/walletconnect-logo.svg",
          height: 48,
          width: 48,
          excavate: true,
        }}
      />
      <CopyCode code={wcUri} />
      {error && (
        <p className="m-0 text-center font-sans text-caption text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
