import { useState } from 'react';
import { EVMcrispr, isProviderAction, parseScript } from '@1hive/evmcrispr';
import { useConnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';

import type { Action, ForwardOptions } from '@1hive/evmcrispr';
import type { Connector } from 'wagmi';
import type { providers } from 'ethers';

import { Button, HStack, VStack, useDisclosure } from '@chakra-ui/react';

import LogModal from '../LogModal';
import ErrorMsg from './ErrorMsg';

const executeAction = async (
  action: Action,
  connector: Connector,
  options?: ForwardOptions,
): Promise<providers.TransactionReceipt | void> => {
  if (!(connector instanceof InjectedConnector)) {
    throw new Error(
      `Provider action-returning commands are only supported by injected wallets (e.g. Metamask)`,
    );
  }

  if (isProviderAction(action)) {
    const [chainParam] = action.params;
    const chain = await connector.switchChain(Number(chainParam.chainId));
    if (chain.id !== Number(chainParam.chainId)) {
      throw new Error('Incorrect Chain ID.');
    }
  } else {
    const signer = await connector.getSigner();
    return (
      await signer.sendTransaction({
        ...action,
        gasPrice: options?.gasPrice,
        gasLimit: options?.gasLimit,
      })
    ).wait();
  }
};

type ActionButtonsType = {
  address: string;
  terminalStoreActions: Record<string, any>;
  terminalStoreState: {
    errors?: string[];
    isLoading: boolean;
    script: any;
  };
  maximizeGasLimit: boolean;
};

export default function ActionButtons({
  address,
  terminalStoreActions,
  terminalStoreState,
  maximizeGasLimit,
}: ActionButtonsType) {
  const [logs, setLogs] = useState<string[]>([]);

  const {
    isOpen: isLogModalOpen,
    onOpen: onLogModalOpen,
    onClose: _onLogModalClose,
  } = useDisclosure({
    id: 'log',
  });

  const { activeConnector } = useConnect();

  const { errors, isLoading, script } = terminalStoreState;

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
      const signer = await activeConnector?.getSigner();
      if (!activeConnector || signer === undefined || signer === null)
        throw new Error('Account not connected');

      const { ast, errors } = parseScript(script);

      if (errors.length) {
        terminalStoreActions.isLoading(false);
        terminalStoreActions.errors(errors);
        return;
      }

      await new EVMcrispr(ast, () => activeConnector.getSigner())
        .registerLogListener(logListener)
        .interpret(async (action) => {
          await executeAction(
            action,
            activeConnector,
            maximizeGasLimit ? { gasLimit: 10_000_000 } : {},
          );
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
