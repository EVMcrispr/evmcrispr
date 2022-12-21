import { Link } from 'react-router-dom';
import { codename, version } from '@1hive/evmcrispr/package.json';
import {
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Stack,
  Text,
  VStack,
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
  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;

  return (
    <>
      <Stack
        justify={'space-between'}
        mb={32}
        align={{ base: 'unset', md: 'flex-end' }}
        direction={{ base: 'column', md: 'row' }}
        spacing={{ base: 6, md: 0 }}
      >
        <Stack
          spacing={6}
          align={{ base: 'flex-start', md: 'flex-end' }}
          direction={{ base: 'column', md: 'row' }}
        >
          <Link to="/">
            <Image src={logo} alt="Logo" width={52} />
          </Link>
          <HStack bgColor={'brand.gray.800'}>
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
        </Stack>
        {address ? (
          <VStack
            align={{ base: 'flex-start', md: 'flex-end' }}
            alignSelf={{ base: 'flex-start', md: 'flex-end' }}
          >
            <Flex
              border={'1px solid'}
              borderColor={'brand.green.300'}
              px={6}
              align={'center'}
            >
              <Text color={'white'} fontSize={'2xl'}>
                {addressShortened}
              </Text>
            </Flex>
            <Button
              variant="overlay"
              colorScheme="pink"
              onClick={onDisconnect}
              size="sm"
            >
              Disconnect
            </Button>
          </VStack>
        ) : (
          <Button
            variant="overlay"
            colorScheme={'green'}
            isLoading={isConnecting}
            loadingText={'Connecting…'}
            onClick={onWalletModalOpen}
          >
            Connect
          </Button>
        )}
      </Stack>
      <SelectWalletModal
        isOpen={isWalletModalOpen}
        onClose={onWalletModalClose}
      />
    </>
  );
}
