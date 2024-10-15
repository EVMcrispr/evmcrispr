import { useState } from "react";
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  VStack,
} from "@chakra-ui/react";
import type { Connector } from "wagmi";
import { useConnect } from "wagmi";

import WalletButton from "./WalletButton";
import WalletConnectCode from "./WalletConnectCode";
import SafeConnect from "./SafeConnect";
import MetamaskIcon from "../icons/MetamaskIcon";
import WalletIcon from "../icons/WalletIcon";
import SafeIcon from "../icons/SafeIcon";

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
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      isCentered
      colorScheme="yellow"
      size={"md"}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{getModalTitle()}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>{renderModalContent()}</ModalBody>
      </ModalContent>
    </Modal>
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
    <VStack spacing={7} w={"300px"}>
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
    </VStack>
  );
}
