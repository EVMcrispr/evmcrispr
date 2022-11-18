import { useState } from 'react';
import { EVMcrispr, isProviderAction, parseScript } from '@1hive/evmcrispr';
import { useConnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';

import type { Action, ForwardOptions } from '@1hive/evmcrispr';
import type { Connector } from 'wagmi';
import type { providers } from 'ethers';

import {
  Button,
  FormLabel,
  HStack,
  Switch,
  VStack,
  useBoolean,
  useDisclosure,
} from '@chakra-ui/react';

import LogModal from '../log-modal';
import ErrorMsg from './error-msg';
import ShareButton from '../share-button';

// TODO: Migrate logic to evmcrispr
const executeActions = async (
  actions: Action[],
  connector: Connector,
  options?: ForwardOptions,
): Promise<providers.TransactionReceipt[]> => {
  const txs = [];

  if (!(connector instanceof InjectedConnector)) {
    throw new Error(
      `Provider action-returning commands are only supported by injected wallets (e.g. Metamask)`,
    );
  }

  for (const action of actions) {
    if (isProviderAction(action)) {
      const [chainParam] = action.params;

      await connector.switchChain(Number(chainParam.chainId));
    } else {
      const signer = await connector.getSigner();
      txs.push(
        await (
          await signer.sendTransaction({
            ...action,
            gasPrice: options?.gasPrice,
            gasLimit: options?.gasLimit,
          })
        ).wait(),
      );
    }
  }
  return txs;
};

type ActionButtonsType = {
  address: string;
  terminalStoreActions: Record<string, any>;
  terminalStoreState: {
    errors?: string[];
    isLoading: boolean;
    script: any;
  };
};

export default function ActionButtons({
  address,
  terminalStoreActions,
  terminalStoreState,
}: ActionButtonsType) {
  const [maximizeGasLimit, setMaximizeGasLimit] = useBoolean(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [url] = useState('');

  const {
    isOpen: isLogModalOpen,
    onOpen: onLogModalOpen,
    onClose: _onLogModalClose,
  } = useDisclosure({
    id: 'log',
  });

  const { activeConnector } = useConnect();

  const { errors, isLoading, script } = terminalStoreState;
  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;

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

      const actions = await new EVMcrispr(ast, signer)
        .registerLogListener(logListener)
        .interpret();

      await executeActions(
        actions,
        activeConnector,
        maximizeGasLimit ? { gasLimit: 10_000_000 } : {},
      );

      // TODO: adapt to cas11 changes
      // const chainId = (await signer.provider?.getNetwork())?.chainId;
      // setUrl(`https://${client(chainId)}/#/${connectedDAO.kernel.address}/${}`);
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
      <HStack mt={3} align="flex-start">
        <HStack width="100%">
          <FormLabel htmlFor="maximize-gas-limit">
            Maximize gas limit?
          </FormLabel>
          <Switch
            id="maximize-gas-limit"
            size="sm"
            checked={maximizeGasLimit}
            onChange={setMaximizeGasLimit.toggle}
          />
        </HStack>
        <VStack alignItems="flex-end" gap={3} pr={{ base: 6, lg: 0 }}>
          {address ? (
            <>
              {url ? (
                <Button
                  variant="warning"
                  onClick={() => window.open(url, '_blank')}
                >
                  Go to vote
                </Button>
              ) : null}

              <Button
                variant="lime"
                onClick={onExecute}
                disabled={isLoading}
                isLoading={isLoading}
                loadingText={`Forwarding from ${addressShortened}`}
              >
                Forward from {addressShortened}
              </Button>
            </>
          ) : null}

          <ShareButton script={script} />

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
