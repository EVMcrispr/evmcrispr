import { Overlay } from "@repo/ui";
import { useCallback, useState } from "react";
import { useConnect, useConnectors } from "wagmi";
import { useWalletConnect } from "../../hooks/useWalletConnect";
import type { MobileWallet } from "../../utils/mobile-wallet";
import {
  hasInjectedProvider,
  isMobileDevice,
  MOBILE_WALLETS,
} from "../../utils/mobile-wallet";
import MetamaskIcon from "../icons/MetamaskIcon";
import SafeIcon from "../icons/SafeIcon";
import WalletIcon from "../icons/WalletIcon";
import SafeConnect from "./SafeConnect";
import WalletButton from "./WalletButton";
import WalletConnectCode from "./WalletConnectCode";

type View = "wallets" | "walletConnect" | "safe";

export default function SelectWalletModal({
  isOpen,
  onClose,
  mobile = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  mobile?: boolean;
}) {
  const [view, setView] = useState<View>("wallets");
  const [deepLinkedWallet, setDeepLinkedWallet] = useState<MobileWallet | null>(
    null,
  );
  const { mutate: connect } = useConnect();
  const connectors = useConnectors();
  const walletConnectConnector = connectors.find(
    (c) => c.id === "walletConnect",
  );
  const injectedConnector = connectors.find((c) => c.id === "injected");
  // The device decides how we connect; the `mobile` prop only picks the shell.
  // Inside a wallet's own dapp browser there is a provider to talk to, so a
  // phone only needs deep links when nothing was injected.
  const injectedAvailable = hasInjectedProvider();
  const useDeepLinks = isMobileDevice() && !injectedAvailable;

  const handleModalClose = useCallback(() => {
    onClose();
    setView("wallets");
    setDeepLinkedWallet(null);
  }, [onClose]);

  const { wcUri, error, startConnection, reopenWallet, canReopenWallet } =
    useWalletConnect({
      walletConnectConnector,
      onConnect: handleModalClose,
    });

  const openWalletConnect = (wallet?: MobileWallet) => {
    // No WalletConnect project id configured: the wallet's own dapp browser is
    // the only remaining way in on a phone.
    if (!walletConnectConnector) {
      const fallback = wallet?.dappBrowserLink?.();
      if (fallback) window.location.href = fallback;
      return;
    }

    setDeepLinkedWallet(wallet ?? null);
    setView("walletConnect");
    startConnection(wallet?.deepLink);
  };

  const renderModalContent = () => {
    if (view === "walletConnect") {
      return (
        <WalletConnectCode
          wcUri={wcUri}
          error={error}
          walletName={deepLinkedWallet?.name}
          canReopenWallet={canReopenWallet}
          onReopenWallet={reopenWallet}
        />
      );
    }

    if (view === "safe") {
      return <SafeConnect onConnect={handleModalClose} />;
    }

    return (
      <div className="flex w-full max-w-[300px] flex-col gap-7">
        {useDeepLinks ? (
          MOBILE_WALLETS.map((wallet) => (
            <WalletButton
              key={wallet.id}
              name={wallet.name}
              leftIcon={<MetamaskIcon />}
              disabled={!walletConnectConnector && !wallet.dappBrowserLink}
              onClick={() => openWalletConnect(wallet)}
            />
          ))
        ) : (
          <WalletButton
            name="Metamask"
            leftIcon={<MetamaskIcon />}
            disabled={!injectedConnector || !injectedAvailable}
            onClick={() => {
              if (!injectedConnector) return;
              connect(
                { connector: injectedConnector },
                { onSuccess: handleModalClose },
              );
            }}
          />
        )}
        {/* On a phone this covers every wallet we do not deep-link into: the
            user copies the link and pastes it in their app. */}
        {walletConnectConnector && (
          <WalletButton
            name={useDeepLinks ? "Other wallet" : "WalletConnect"}
            leftIcon={<WalletIcon />}
            onClick={() => openWalletConnect()}
          />
        )}
        <WalletButton
          name="Safe"
          leftIcon={<SafeIcon />}
          onClick={() => setView("safe")}
        />
      </div>
    );
  };

  const getModalTitle = () => {
    switch (view) {
      case "walletConnect":
        return deepLinkedWallet
          ? `Connect ${deepLinkedWallet.name}`
          : "Scan with WalletConnect";
      case "safe":
        return "Connect to a Safe";
      default:
        return "Select Wallet";
    }
  };

  // A sheet where the layout is the phone's, a dialog otherwise.
  return (
    <Overlay
      open={isOpen}
      onOpenChange={(open) => !open && handleModalClose()}
      sheet={mobile}
      title={getModalTitle()}
      description={
        mobile ? "Connect securely, then return to your review." : undefined
      }
      closeLabel="Close wallet selection"
    >
      <div className="flex w-full flex-col items-center px-2 py-6">
        {renderModalContent()}
      </div>
    </Overlay>
  );
}
