import { useState } from 'react';
import { EVMcrispr, isProviderAction, parseScript } from '@1hive/evmcrispr';
import { useWalletClient } from 'wagmi';
import { Button, HStack, VStack, useDisclosure } from '@chakra-ui/react';

import LogModal from '../LogModal';
import ErrorMsg from './ErrorMsg';

import { config } from '../../wagmi';

import {
  terminalStoreActions,
  useTerminalStore,
} from '../TerminalEditor/use-terminal-store';
import { clientToSigner } from '../../utils/ethers';

type ActionButtonsType = {
  address: string;
  maximizeGasLimit: boolean;
};

export default function ActionButtons({
  address,
  maximizeGasLimit,
}: ActionButtonsType) {
  const [logs, setLogs] = useState<string[]>([]);

  const { errors, isLoading, script } = useTerminalStore();

  const {
    isOpen: isLogModalOpen,
    onOpen: onLogModalOpen,
    onClose: _onLogModalClose,
  } = useDisclosure({
    id: 'log',
  });

  const { data: client } = useWalletClient();

  function logListener(message: string, prevMessages: string[]) {
    if (!isLogModalOpen) {
      onLogModalOpen();
    }
    console.log(message);
    setLogs([...prevMessages, message]);
  }

  function onLogModalClose() {
    _onLogModalClose();
    setLogs([]);
  }

  async function onExecute() {
    terminalStoreActions.errors([]);
    terminalStoreActions.isLoading(true);

    try {
      if (client === undefined) throw new Error('Account not connected');

      const { ast, errors } = parseScript(script);

      if (errors.length) {
        terminalStoreActions.isLoading(false);
        terminalStoreActions.errors(errors);
        return;
      }

      await new EVMcrispr(ast, async () => clientToSigner(client!))
        .registerLogListener(logListener)
        .interpret(async (action) => {
          if (isProviderAction(action)) {
            const [chainParam] = action.params;
            await client.switchChain({ id: Number(chainParam.chainId) });
          } else {
            const chainId = await client.getChainId();
            await client.sendTransaction({
              chain: config.chains.find((chain) => chain.id === chainId),
              to: action.to as `0x${string}`,
              from: action.from as `0x${string}`,
              data: action.data as `0x${string}`,
              value: BigInt(action.value || 0),
              gasLimit: maximizeGasLimit ? 10_000_000n : undefined,
            });
          }
        });
    } catch (err: any) {
      const e = err as Error;
      console.error(e);
      if (
        e.message.startsWith('transaction failed') &&
        /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
      ) {
        terminalStoreActions.errors([
          `Transaction failed, watch in block explorer ${
            e.message.split('"')[1]
          }`,
        ]);
      } else {
        terminalStoreActions.errors([e.message]);
      }
    } finally {
      terminalStoreActions.isLoading(false);
    }
  }

  return (
    <>
      <HStack mt={3} justify="flex-end">
        <VStack
          alignItems="flex-end"
          spacing={3}
          height="60px"
          pr={{ base: 6, lg: 0 }}
        >
          {address ? (
            <Button
              variant="overlay"
              colorScheme={'green'}
              onClick={onExecute}
              isLoading={isLoading}
              loadingText={'Executing'}
              size={'md'}
            >
              Execute
            </Button>
          ) : null}
          {errors ? <ErrorMsg errors={errors} /> : null}
        </VStack>
      </HStack>
      <LogModal
        isOpen={isLogModalOpen}
        logs={logs}
        closeModal={onLogModalClose}
      />
    </>
  );
}
