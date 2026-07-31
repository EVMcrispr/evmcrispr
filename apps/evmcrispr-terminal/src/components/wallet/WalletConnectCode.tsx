import { Button } from "@repo/ui";
import { QRCodeSVG } from "qrcode.react";
import CopyCode from "./CopyCode";

const GREEN_300 = "#8CF467";

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
      <p className="font-sans text-sm text-foreground/70">
        {error ? error.message : "Preparing connection..."}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {canReopenWallet && (
        <>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onReopenWallet}
          >
            Open {walletName ?? "wallet"}
          </Button>
          <p className="text-center font-sans text-xs text-foreground/70">
            If {walletName ?? "your wallet"} did not open, copy the link below
            and paste it there.
          </p>
        </>
      )}
      <QRCodeSVG
        value={wcUri}
        size={400}
        bgColor="black"
        fgColor={GREEN_300}
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
        <p className="text-center font-sans text-xs text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
