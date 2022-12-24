import { useEffect } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  VStack,
} from '@chakra-ui/react';
import { useConnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';

import MetamaskIcon from '../icons/metamask-icon';
import WalletIcon from '../icons/wallet-icon';

export default function SelectWalletModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    connectors,
    connect,
    isConnecting,
    isError,
    isConnected,
    pendingConnector,
  } = useConnect();

  const connectingToMetamask =
    pendingConnector instanceof InjectedConnector && isConnecting;

  useEffect(() => {
    if (isError || isConnected) {
      onClose();
    }
  }, [isError, isConnected, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      colorScheme={'yellow'}
      size={'md'}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Select Wallet</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={7} w={'300px'}>
            <Button
              disabled={connectingToMetamask}
              variant="icon"
              onClick={() => connect(connectors[0])}
              size="lg"
              leftIcon={<MetamaskIcon />}
              isLoading={connectingToMetamask}
              w={'100%'}
            >
              Metamask
            </Button>
            <Button
              variant="icon"
              onClick={() => {
                connect(connectors[1]);
              }}
              size="lg"
              leftIcon={<WalletIcon />}
              w={'100%'}
            >
              Wallet Connect
            </Button>
            {/* <Button
              variant="outline"
              onClick={() => {
                connect(connectors[2]);
                onClose();
              }}
              w="100%"
            >
              <HStack w="100%" justifyContent="center">
                <Image
                  src="/wallets/frame.svg"
                  alt="Frame Logo"
                  width={25}
                  height={25}
                  borderRadius="3px"
                />
                <Text>Frame</Text>
              </HStack>
            </Button> */}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
