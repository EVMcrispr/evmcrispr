import { XMarkIcon } from "@heroicons/react/24/outline";
import { Dialog, Drawer, IconButton } from "@repo/ui";
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

  if (mobile) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => !open && handleModalClose()}
        direction="bottom"
        modal
      >
        <Drawer.Content
          side="bottom"
          className="max-h-[92dvh] border-evm-yellow-300 bg-[#0b0d0c]"
        >
          <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-foreground/25" />
          <Drawer.Header className="border-foreground/10">
            <div>
              <Drawer.Title className="font-sans text-xl text-evm-yellow-300">
                {getModalTitle()}
              </Drawer.Title>
              <Drawer.Description className="font-sans text-xs">
                Connect securely, then return to your review.
              </Drawer.Description>
            </div>
            <Drawer.Close asChild>
              <IconButton
                type="button"
                aria-label="Close wallet selection"
                variant="ghost"
                size="lg"
                className="min-h-11 min-w-11"
              >
                <XMarkIcon className="size-5" />
              </IconButton>
            </Drawer.Close>
          </Drawer.Header>
          <div className="mobile-safe-bottom flex w-full flex-col items-center overflow-y-auto px-6 py-8">
            {renderModalContent()}
          </div>
        </Drawer.Content>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleModalClose()}>
      <Dialog.Content
        size="md"
        className="border-evm-yellow-300 [--shadow-color:rgba(226,249,98,0.5)]"
      >
        <Dialog.Header className="bg-black text-evm-yellow-300 border-evm-yellow-300">
          {getModalTitle()}
        </Dialog.Header>
        <div className="w-full flex justify-center items-center flex-col px-10 py-12">
          {renderModalContent()}
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
