import { useEffect, useRef, useState } from 'react';
import { EVMcrispr, isProviderAction, parseScript } from '@1hive/evmcrispr';
import { useConnect, useDisconnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';

import type { Action, ForwardOptions } from '@1hive/evmcrispr';
import type { Connector } from 'wagmi';
import type { providers } from 'ethers';

import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Collapse,
  FormLabel,
  HStack,
  Switch,
  VStack,
  useBoolean,
  useDisclosure,
} from '@chakra-ui/react';

import SelectWalletModal from '../wallet-modal';
import LogModal from '../log-modal';

const COLLAPSE_THRESHOLD = 30;

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
    errors?: Array<any>;
    isLoading: boolean;
    script: any;
  };
};

export default function ActionButtons({
  address,
  terminalStoreActions,
  terminalStoreState,
}: ActionButtonsType) {
  const [showCollapse, setShowCollapse] = useState(false);
  const [maximizeGasLimit, setMaximizeGasLimit] = useBoolean(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [url] = useState('');
  const [showExpandBtn, setShowExpandBtn] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { activeConnector, isConnecting } = useConnect();
  const { errors, isLoading, script } = terminalStoreState;

  const {
    isOpen: isWalletModalOpen,
    onOpen: onWalletModalOpen,
    onClose: onWalletModalClose,
  } = useDisclosure();
  const {
    isOpen: isLogModalOpen,
    onOpen: onLogModalOpen,
    onClose: _onLogModalClose,
  } = useDisclosure();

  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;
  const { disconnect } = useDisconnect();

  async function onDisconnect() {
    terminalStoreActions.errors([]);
    disconnect();
  }

  const logListener = (message: string, prevMessages: string[]) => {
    if (!isLogModalOpen) {
      onLogModalOpen();
    }
    console.log(message);
    setLogs([...prevMessages, message]);
  };

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

  useEffect(() => {
    if (!errors?.length) {
      setShowExpandBtn(false);
    } else if (contentRef.current) {
      setShowExpandBtn(contentRef.current.clientHeight > COLLAPSE_THRESHOLD);
    }
  }, [errors]);

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
          {!address ? (
            <Button
              variant="lime"
              onClick={onWalletModalOpen}
              disabled={isConnecting}
              isLoading={isConnecting}
              loadingText={'Connecting…'}
            >
              Connect
            </Button>
          ) : (
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
              <Button
                variant="link"
                color="white"
                onClick={onDisconnect}
                size="sm"
              >
                Disconnect
              </Button>
            </>
          )}

          {errors ? (
            <Box
              display="flex"
              flexDirection="column"
              justifyContent="left"
              maxWidth="100%"
              wordBreak="break-all"
            >
              {errors.map((e, index) => (
                <Alert key={index} status="error">
                  <Box display="flex" alignItems="flex-start">
                    <AlertIcon />
                    <AlertDescription>
                      <Collapse
                        startingHeight={COLLAPSE_THRESHOLD}
                        in={showCollapse}
                      >
                        <div ref={contentRef}>{e}</div>
                      </Collapse>
                    </AlertDescription>
                  </Box>
                </Alert>
              ))}
              {showExpandBtn && (
                <Button
                  width="30"
                  alignSelf="flex-end"
                  size="sm"
                  onClick={() => setShowCollapse((show) => !show)}
                  mt="1rem"
                >
                  Show {showCollapse ? 'Less' : 'More'}
                </Button>
              )}
            </Box>
          ) : null}
        </VStack>
      </HStack>
      <SelectWalletModal
        isOpen={isWalletModalOpen}
        closeModal={onWalletModalClose}
      />
      <LogModal
        isOpen={isLogModalOpen}
        logs={logs}
        closeModal={onLogModalClose}
      />
    </>
  );
}
