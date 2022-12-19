import { Link } from 'react-router-dom';
import { codename, version } from '@1hive/evmcrispr/package.json';
import {
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Text,
  useDisclosure,
} from '@chakra-ui/react';

import { useConnect, useDisconnect } from 'wagmi';

import logo from '../../assets/logo.svg';
import SelectWalletModal from '../wallet-modal';

export default function TerminalHeader({
  terminalStoreActions,
  address,
}: {
  terminalStoreActions: {
    errors: (param: string[]) => void;
  };
  address: string;
}) {
  const { isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  const {
    isOpen: isWalletModalOpen,
    onOpen: onWalletModalOpen,
    onClose: onWalletModalClose,
  } = useDisclosure({
    id: 'wallet',
  });

  async function onDisconnect() {
    terminalStoreActions.errors([]);
    disconnect();
  }

  return (
    <>
      <Flex justify={'space-between'}>
        <HStack spacing={6} align={'flex-end'}>
          <Link to="/">
            <Image src={logo} alt="Logo" width={52} />
          </Link>
          <HStack bgColor={'brand.darkGray'}>
            <Box w={1.5} h={9} bgColor={'brand.green.300'} />
            <Text
              color="white"
              fontSize="sm"
              border="none"
              background="transparent"
              overflow="hidden" // Ensures the content is not revealed until the animation
              borderRight=".5em solid transparent" // The typwriter cursor
              whiteSpace="nowrap" // / Keeps the content on a single line
              letterSpacing=".12em" // Adjust as needed
              width={'16.5rem'}
              animation="typing 2.5s steps(40, end)"
            >
              {`${codename ? ` "${codename}"` : null} v${version}`}
            </Text>
          </HStack>
        </HStack>
        {address ? (
          <Button variant="link" color="white" onClick={onDisconnect} size="sm">
            Disconnect
          </Button>
        ) : (
          <Button
            variant="lime"
            isLoading={isConnecting}
            loadingText={'Connecting…'}
            onClick={onWalletModalOpen}
          >
            Connect
          </Button>
        )}
      </Flex>
      <SelectWalletModal
        isOpen={isWalletModalOpen}
        onClose={onWalletModalClose}
      />
    </>
  );
}
