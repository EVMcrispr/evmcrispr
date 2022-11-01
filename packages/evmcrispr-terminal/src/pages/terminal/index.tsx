import { IPFSResolver } from '@1hive/evmcrispr';
import type { Monaco } from '@monaco-editor/react';
import MonacoEditor, { useMonaco } from '@monaco-editor/react';
import { useChain, useSpringRef } from '@react-spring/web';
import { Box, useDisclosure } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useConnect, useProvider } from 'wagmi';

import FadeIn from '../../components/animations/fade-in';
import Footer from '../../components/footer';
import TerminalButtons from './Buttons';

import { useDebounce } from '../../hooks/useDebounce';
import { terminalStoreActions, useTerminalStore } from './useTerminalStore';

import { createProvideCompletionItemsFn } from '../../editor/autocompletion';
import { theme } from '../../editor/theme';
import {
  conf,
  contribution,
  createLanguage,
  getModulesKeywords,
} from '../../editor/evmcl';

const ipfsResolver = new IPFSResolver();

export default function Terminal() {
  const [firstTry, setFirstTry] = useState(true);
  const { onOpen } = useDisclosure();

  const monaco = useMonaco();
  const { bindingsCache, errors, isLoading, script, ast, currentModuleNames } =
    useTerminalStore();
  const { connectors, connect, isConnected } = useConnect();
  const provider = useProvider();

  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const footerRef = useSpringRef();

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

  function handleOnChange(str: string | undefined, ev: any) {
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
  }

  function handleBeforeMount(monaco: Monaco) {
    monaco.editor.defineTheme('theme', theme);
    monaco.languages.register(contribution);
    monaco.languages.setLanguageConfiguration('evmcl', conf);
  }

  function handleOnMount(editor: any) {
    editor.setPosition({ lineNumber: 10000, column: 0 });
    editor.focus();
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
            onChange={handleOnChange}
            beforeMount={handleBeforeMount}
            onMount={handleOnMount}
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
          <TerminalButtons
            terminalStore={{
              errors,
              isLoading,
              script,
            }}
            onOpen={onOpen}
          />
        </FadeIn>
      </Box>
      <FadeIn componentRef={footerRef}>
        <Footer />
      </FadeIn>
    </>
  );
}
