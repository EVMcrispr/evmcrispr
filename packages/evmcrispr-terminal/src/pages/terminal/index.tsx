import {
  EVMcrispr,
  IPFSResolver,
  isProviderAction,
  parseScript,
} from '@1hive/evmcrispr';
import type { Action, ForwardOptions } from '@1hive/evmcrispr';
import MonacoEditor, { useMonaco } from '@monaco-editor/react';
import { useChain, useSpringRef } from '@react-spring/web';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Collapse,
  FormLabel,
  HStack,
  Spinner,
  Switch,
  VStack,
  useBoolean,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import type { Connector } from 'wagmi';
import { useAccount, useConnect, useDisconnect, useProvider } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import type { providers } from 'ethers';

import { theme } from '../../editor/theme';
import {
  conf,
  contribution,
  createLanguage,
  getModulesKeywords,
} from '../../editor/evmcl';

import SelectWalletModal from '../../components/modal';
import FadeIn from '../../components/animations/fade-in';
import Footer from '../../components/footer';
import { terminalStoreActions, useTerminalStore } from './use-terminal-store';
import { createProvideCompletionItemsFn } from '../../editor/autocompletion';
import { useDebounce } from '../../hooks/useDebounce';

const ipfsResolver = new IPFSResolver();

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

const COLLAPSE_THRESHOLD = 30;

export const Terminal = () => {
  const monaco = useMonaco();
  const { bindingsCache, errors, isLoading, script, ast, currentModuleNames } =
    useTerminalStore();

  // TODO: It needs a refactor, it should not use a location.href change
  const encodedScript = new URLSearchParams(
    window.location.hash.split('?')[1],
  ).get('script');
  if (encodedScript) {
    terminalStoreActions.script(encodedScript);
    terminalStoreActions.processScript();
    window.location.href = window.location.hash.split('?')[0];
  }

  const { data: account } = useAccount();
  const { connectors, activeConnector, connect, isConnected, isConnecting } =
    useConnect();
  const { disconnect } = useDisconnect();
  const provider = useProvider();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const footerRef = useSpringRef();
  const [url] = useState('');
  const [firstTry, setFirstTry] = useState(true);
  const [showCollapse, setShowCollapse] = useState(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);
  const [maximizeGasLimit, setMaximizeGasLimit] = useBoolean(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const address = account?.address ?? '';
  const addressShortened = `${address.slice(0, 6)}..${address.slice(-4)}`;
  const forwardingText = `Forwarding from ${addressShortened}`;

  const debouncedScript = useDebounce(script, 200);

  useChain([terminalRef, buttonsRef, footerRef]);

  /**
   * Try to connect as soon as page mounts
   * to have access to a provider to use on
   * auto-completion
   */
  useEffect(() => {
    if (!firstTry || isConnected) {
      return;
    }
    connect(connectors[0]);
    setFirstTry(false);
  }, [firstTry, connect, connectors, isConnected]);

  useEffect(() => {
    terminalStoreActions.processScript();
  }, [debouncedScript]);

  useEffect(() => {
    if (!monaco) {
      return;
    }
    const { commandKeywords, helperKeywords } = getModulesKeywords(
      currentModuleNames,
      bindingsCache,
    );

    const tokensProvider = monaco.languages.setMonarchTokensProvider(
      'evmcl',
      createLanguage(commandKeywords, helperKeywords),
    );

    return () => {
      tokensProvider.dispose();
    };
  }, [monaco, currentModuleNames, bindingsCache]);

  useEffect(() => {
    if (!monaco || !provider) {
      return;
    }
    const completionProvider = monaco.languages.registerCompletionItemProvider(
      'evmcl',
      {
        provideCompletionItems: createProvideCompletionItemsFn(
          bindingsCache,
          { provider, ipfsResolver },
          ast,
        ),
      },
    );

    return () => {
      completionProvider.dispose();
    };
  }, [bindingsCache, monaco, provider, ast]);

  useEffect(() => {
    if (!errors.length) {
      setShowExpandBtn(false);
    } else if (contentRef.current) {
      setShowExpandBtn(contentRef.current.clientHeight > COLLAPSE_THRESHOLD);
    }
  }, [errors]);

  async function onDisconnect() {
    terminalStoreActions.errors([]);
    disconnect();
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
      const actions = await new EVMcrispr(ast, signer).interpret();

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
      <Box maxWidth="956px" margin="0 auto" my={16}>
        <FadeIn componentRef={terminalRef}>
          <MonacoEditor
            height="50vh"
            theme="theme"
            language="evmcl"
            value={script}
            onChange={(str, ev) => {
              terminalStoreActions.script(str ?? '');
              const change = ev.changes[0];
              const startLineNumber = change.range.startLineNumber;
              const newLine = change.text
                ? change.text.split('\n').length +
                  startLineNumber -
                  // Substract current line
                  1
                : startLineNumber;
              terminalStoreActions.updateCurrentLine(newLine);
            }}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('theme', theme);
              monaco.languages.register(contribution);
              monaco.languages.setLanguageConfiguration('evmcl', conf);
            }}
            onMount={(editor) => {
              editor.setPosition({ lineNumber: 10000, column: 0 });
              editor.focus();
            }}
            options={{
              fontSize: 22,
              fontFamily: 'Ubuntu Mono',
              detectIndentation: false,
              quickSuggestionsDelay: 100,
              tabSize: 2,
              language: 'evmcl',
              minimap: {
                enabled: false,
              },
              scrollbar: {
                useShadows: false,
                verticalScrollbarSize: 7,
                vertical: 'hidden',
              },
            }}
          />
        </FadeIn>
        <FadeIn componentRef={buttonsRef}>
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
                <Button variant="lime" onClick={onOpen} disabled={isConnecting}>
                  {isConnecting ? (
                    <Box>
                      <Spinner verticalAlign="middle" /> Connecting…
                    </Box>
                  ) : (
                    'Connect'
                  )}
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
                  >
                    {isLoading ? (
                      <Box>
                        <Spinner verticalAlign="middle" /> {forwardingText}
                      </Box>
                    ) : (
                      forwardingText
                    )}
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
        </FadeIn>
      </Box>
      <FadeIn componentRef={footerRef}>
        <Footer />
      </FadeIn>
      <SelectWalletModal isOpen={isOpen} closeModal={onClose} />
    </>
  );
};
