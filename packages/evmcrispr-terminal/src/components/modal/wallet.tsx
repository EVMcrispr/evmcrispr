import {
  Button,
  HStack,
  Image,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useConnect } from 'wagmi';

export default function SelectWalletModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { connectors, connect } = useConnect();

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent w="300px">
        <ModalHeader color="white">Select Wallet</ModalHeader>
        <ModalCloseButton
          _focus={{
            color: 'white',
            boxShadow: 'none',
          }}
        />
        <ModalBody paddingBottom="1.5rem">
          <VStack>
            <Button
              variant="outline"
              onClick={() => {
                connect(connectors[0]);
                onClose();
              }}
              w="100%"
              size="md"
            >
              <HStack w="100%" justifyContent="center">
                <Image
                  src="/wallets/metamask.svg"
                  alt="Metamask Logo"
                  width={25}
                  height={25}
                  borderRadius="3px"
                />
                <Text>Metamask</Text>
              </HStack>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                connect(connectors[1]);
                onClose();
              }}
              w="100%"
              size="md"
            >
              <HStack w="100%" justifyContent="center">
                <Image
                  src="/wallets/walletconnect.svg"
                  alt="Wallet Connect Logo"
                  width={26}
                  height={26}
                  borderRadius="3px"
                />
                <Text>Wallet Connect</Text>
              </HStack>
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
