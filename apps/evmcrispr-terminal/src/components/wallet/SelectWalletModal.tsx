import { XMarkIcon } from "@heroicons/react/24/outline";
import { Dialog, Drawer, IconButton } from "@repo/ui";
import { useState } from "react";
import type { Connector } from "wagmi";
import { useConnect, useConnectors } from "wagmi";
import MetamaskIcon from "../icons/MetamaskIcon";
import SafeIcon from "../icons/SafeIcon";
import WalletIcon from "../icons/WalletIcon";
import SafeConnect from "./SafeConnect";
import WalletButton from "./WalletButton";
import WalletConnectCode from "./WalletConnectCode";

export default function SelectWalletModal({
  isOpen,
  onClose,
  mobile = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  mobile?: boolean;
}) {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const connectors = useConnectors();
  const walletConnectConnector = connectors.find(
    (c) => c.id === "walletConnect",
  );

  const handleModalClose = () => {
    onClose();
    setSelectedWallet(null);
  };

  const renderModalContent = () => {
    if (selectedWallet === "walletConnect" && walletConnectConnector) {
      return (
        <WalletConnectCode
          walletConnectConnector={walletConnectConnector}
          onConnect={handleModalClose}
        />
      );
    }

    if (selectedWallet === "safe") {
      return <SafeConnect onConnect={handleModalClose} />;
    }

    return (
      <WalletList
        connectors={connectors}
        handleModalClose={handleModalClose}
        setSelectedWallet={setSelectedWallet}
      />
    );
  };

  const getModalTitle = () => {
    switch (selectedWallet) {
      case "walletConnect":
        return "Scan with WalletConnect";
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
          <div className="mobile-safe-bottom flex w-full flex-col items-center px-6 py-8">
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

function WalletList({
  connectors,
  handleModalClose,
  setSelectedWallet,
}: {
  connectors: readonly Connector[];
  handleModalClose: () => void;
  setSelectedWallet: (wallet: string) => void;
}) {
  const { mutate: connect } = useConnect();
  const walletConnectConnector = connectors.find(
    (c) => c.id === "walletConnect",
  );

  return (
    <div className="flex w-full max-w-[300px] flex-col gap-7">
      <WalletButton
        name="Metamask"
        connector={connectors[0]}
        leftIcon={<MetamaskIcon />}
        onClick={() => {
          connect(
            { connector: connectors[0] },
            { onSuccess: handleModalClose },
          );
        }}
      />
      {walletConnectConnector && (
        <WalletButton
          name="WalletConnect"
          leftIcon={<WalletIcon />}
          onClick={() => {
            setSelectedWallet("walletConnect");
            walletConnectConnector.connect();
          }}
        />
      )}
      <WalletButton
        name="Safe"
        leftIcon={<SafeIcon />}
        onClick={() => setSelectedWallet("safe")}
      />
    </div>
  );
}
