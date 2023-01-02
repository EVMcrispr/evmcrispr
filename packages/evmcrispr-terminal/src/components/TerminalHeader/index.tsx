import { Link } from 'react-router-dom';
import { codename, version } from '@1hive/evmcrispr/package.json';
import {
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Show,
  Stack,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import Blockies from 'react-blockies';

import { useConnect, useDisconnect } from 'wagmi';

import logo from '../../assets/logo.svg';
import SelectWalletModal from '../SelectWalletModal';
import TypeWriter from '../animations/TypeWriter';

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
        height={12}
        mb={12}
        align={'flex-end'}
        direction={'row'}
        spacing={{ base: 6, md: 0 }}
      >
        <Stack spacing={6} align={'flex-end'} direction={'row'}>
          <Link to="/">
            <Image src={logo} alt="Logo" width={52} />
          </Link>
          <HStack bgColor={'gray.800'}>
            <Box w={1.5} h={9} bgColor={'green.300'} />
            <Show above="md">
              <TypeWriter
                text={`${codename ? ` "${codename}"` : null} v${version}`}
              />
            </Show>
            <Show below="md">
              <TypeWriter text={`v${version}`} />
            </Show>
          </HStack>
        </Stack>
        {address ? (
          <VStack align={'flex-end'} alignSelf={'flex-end'}>
            <Flex
              border={'1px solid'}
              borderColor={'green.300'}
              px={3}
              align={'center'}
            >
              <Blockies seed={address.toLowerCase()} scale={3} />
              <Text ml={3} color={'white'} fontSize={'2xl'}>
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
            size={['md', 'md', 'lg']}
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
