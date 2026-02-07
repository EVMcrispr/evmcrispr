import { Dialog } from "@repo/ui";
import { useState } from "react";
import type { Connector } from "wagmi";
import { useConnect } from "wagmi";
import MetamaskIcon from "../icons/MetamaskIcon";
import SafeIcon from "../icons/SafeIcon";
import WalletIcon from "../icons/WalletIcon";
import SafeConnect from "./SafeConnect";
import WalletButton from "./WalletButton";
import WalletConnectCode from "./WalletConnectCode";

export default function SelectWalletModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const { connectors } = useConnect();
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
  const { connect } = useConnect();
  const walletConnectConnector = connectors.find(
    (c) => c.id === "walletConnect",
  );

  return (
    <div className="flex flex-col gap-7 w-[300px]">
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
