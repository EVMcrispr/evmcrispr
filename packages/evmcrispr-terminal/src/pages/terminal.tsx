import type { ChangeEventHandler } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { IPFSResolver } from '@1hive/evmcrispr';
import { useAccount, useConnect, useProvider } from 'wagmi';
import type { Monaco } from '@monaco-editor/react';

import MonacoEditor, { useMonaco } from '@monaco-editor/react';
import { useChain, useSpringRef } from '@react-spring/web';
import {
  Container,
  Flex,
  HStack,
  Input,
  Spacer,
  VStack,
  useBoolean,
} from '@chakra-ui/react';

import {
  conf,
  contribution,
  createLanguage,
  getModulesKeywords,
} from '../editor/evmcl';
import { createProvideCompletionItemsFn } from '../editor/autocompletion';
import { theme } from '../editor/theme';

import {
  terminalStoreActions,
  useTerminalStore,
} from '../hooks/use-terminal-store';
import { useDebounce } from '../hooks/useDebounce';

import FadeIn from '../components/animations/fade-in';
import Footer from '../components/footer';
import ActionButtons from '../components/action-buttons';
import ConfigureButton from '../components/configure-button';
import ShareScriptButton from '../components/share-script';
import Header from '../components/terminal-header';
import SaveScriptButton from '../components/save-script';
import LibraryScripts from '../components/library-scripts';
import { useStoredScript } from '../hooks/useStoredScript';

const ipfsResolver = new IPFSResolver();

export default function Terminal() {
  const [firstTry, setFirstTry] = useState(true);
  const [maximizeGasLimit, setMaximizeGasLimit] = useBoolean(false);

  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const footerRef = useSpringRef();
  const params = useParams();

  const monaco = useMonaco();
  const {
    bindingsCache,
    errors,
    isLoading,
    title,
    script,
    ast,
    currentModuleNames,
  } = useTerminalStore();

  const { data: account } = useAccount();
  const { connectors, connect, isConnected } = useConnect();
  const provider = useProvider();
  const location = useLocation();
  const navigate = useNavigate();

  const { title: storedTitle, script: storedScript } = useStoredScript(
    params?.scriptId,
  ) || { title, script };

  const address = account?.address ?? '';

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

  // Set up a script if we have one in the URL
  useEffect(() => {
    const encodedScript = new URLSearchParams(
      window.location.hash.split('?')[1],
    ).get('script');
    if (encodedScript) {
      terminalStoreActions.script(encodedScript);
      terminalStoreActions.processScript();
    }
  }, []);

  useEffect(() => {
    if (storedScript !== undefined) {
      terminalStoreActions.title(storedTitle);
      terminalStoreActions.script(storedScript);
      terminalStoreActions.processScript();
    }
  }, [storedTitle, storedScript]);

  useEffect(() => {
    document.title = title
      ? `${title} - EVMcrispr Terminal`
      : 'EVMcrispr Terminal';
  }, [title]);

  // We hide the scriptId when the title or the script change so they don't match anymore with the url
  const hideScriptId = () => {
    if (location.pathname !== '/terminal') {
      navigate('/terminal');
    }
  };

  const handleTitleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    terminalStoreActions.title(event.target.value);
    hideScriptId();
  };
  function handleOnChangeEditor(str: string | undefined, ev: any) {
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
    if (str !== storedScript) {
      hideScriptId();
    }
  }

  function handleBeforeMountEditor(monaco: Monaco) {
    monaco.editor.defineTheme('theme', theme);
    monaco.languages.register(contribution);
    monaco.languages.setLanguageConfiguration('evmcl', conf);
  }

  function handleOnMountEditor(editor: any) {
    editor.setPosition({ lineNumber: 10000, column: 0 });
    editor.focus();
  }

  return (
    <>
      <LibraryScripts />
      <Container maxWidth={{ base: '7xl', '2xl': '8xl' }} my={14}>
        <Header address={address} terminalStoreActions={terminalStoreActions} />
        <FadeIn componentRef={terminalRef}>
          <VStack mb={3} alignItems="flex-end" pr={0}>
            <Flex width={'100%'}>
              <Input
                type="text"
                placeholder={'Untitled script'}
                value={title}
                onChange={handleTitleChange}
                variant={'unstyled'}
                fontSize={'4xl'}
                color={'gray.50'}
                _placeholder={{
                  color: 'inherit',
                }}
                spellCheck="false"
              />
              <Spacer />
              <HStack spacing={1}>
                <SaveScriptButton title={title} script={script} />
                <ShareScriptButton script={script} title={title} />
                <ConfigureButton
                  setMaximizeGasLimit={setMaximizeGasLimit}
                  maximizeGasLimit={maximizeGasLimit}
                />
              </HStack>
            </Flex>
          </VStack>
          <MonacoEditor
            height="50vh"
            theme="theme"
            language="evmcl"
            value={script}
            onChange={handleOnChangeEditor}
            beforeMount={handleBeforeMountEditor}
            onMount={handleOnMountEditor}
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
          <ActionButtons
            address={address}
            terminalStoreActions={terminalStoreActions}
            terminalStoreState={{
              errors,
              isLoading,
              script,
            }}
            maximizeGasLimit={maximizeGasLimit}
          />
        </FadeIn>
      </Container>
      <FadeIn componentRef={footerRef}>
        <Footer />
      </FadeIn>
    </>
  );
}
