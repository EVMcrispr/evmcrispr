import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  VStack,
} from "@chakra-ui/react";
import { useConnect } from "wagmi";

import MetamaskIcon from "../icons/MetamaskIcon";
import WalletIcon from "../icons/WalletIcon";

export default function SelectWalletModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { connectors, isPending, connect } = useConnect();
  const walletConnectConnector = connectors.find(
    (c) => c.id === "walletConnect",
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      colorScheme={"yellow"}
      size={"md"}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Select Wallet</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={7} w={"300px"}>
            <Button
              isLoading={isPending}
              disabled={isPending}
              variant="outline-overlay"
              onClick={() => {
                connect(
                  { connector: connectors[0] },
                  { onSuccess: () => onClose(), onError: () => onClose() },
                );
              }}
              size="lg"
              leftIcon={<MetamaskIcon />}
              w={"100%"}
            >
              Metamask
            </Button>
            {walletConnectConnector && (
              <Button
                disabled={isPending}
                variant="outline-overlay"
                onClick={() => {
                  connect({ connector: walletConnectConnector });
                  onClose();
                }}
                size="lg"
                leftIcon={<WalletIcon />}
                w={"100%"}
              >
                Wallet Connect
              </Button>
            )}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
