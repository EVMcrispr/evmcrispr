import Editor from '@monaco-editor/react';
import { useChain, useSpringRef } from '@react-spring/web';

import { Stack, useDisclosure } from '@chakra-ui/react';

import FadeIn from '../components/animations/fade-in';
import { theme } from '../editor/theme';
import { conf, contribution, language } from '../editor/evmcl';
import { useTerminal } from '../utils/useTerminal';
import SelectWalletModal from '../components/Modal';
import Footer from '../components/footer';

const Terminal = () => {
  const {
    error,
    loading,
    url,
    code,
    setCode,
    address,
    addressShortened,
    onForward,
    onDisconnect,
  } = useTerminal();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const footerRef = useSpringRef();

  useChain([terminalRef, buttonsRef, footerRef]);

  return (
    <div className="terminal-code">
      <Stack spacing={8} marginBottom={24} className="content">
        <FadeIn componentRef={terminalRef}>
          <Editor
            height="50vh"
            theme="theme"
            language="evmcl"
            value={code as string}
            onChange={(str) => setCode(str || '')}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('theme', theme);
              monaco.languages.register(contribution);
              monaco.languages.setLanguageConfiguration('evmcl', conf);
              monaco.languages.setMonarchTokensProvider('evmcl', language);
            }}
            onMount={(editor) => {
              editor.setPosition({ lineNumber: 10000, column: 0 });
              editor.focus();
            }}
            options={{
              fontSize: 22,
              fontFamily: 'Ubuntu Mono',
              detectIndentation: false,
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
          <div className="script-actions">
            {!address ? (
              <button className="button button-success" onClick={onOpen}>
                Connect
              </button>
            ) : (
              <>
                {url ? (
                  <button
                    className="button button-warning"
                    onClick={() => window.open(url, '_blank')}
                  >
                    Go to vote
                  </button>
                ) : null}

                <button className="button button-success" onClick={onForward}>
                  {`${
                    loading ? 'Forwarding' : 'Forward'
                  } from ${addressShortened}`}
                </button>
                <button onClick={onDisconnect}>Disconnect</button>
              </>
            )}

            {error && (
              <div
                className="button button-warning"
                style={{ cursor: 'default' }}
              >
                {error ? 'Error: ' + error : null}
              </div>
            )}
          </div>
        </FadeIn>
      </Stack>
      <FadeIn componentRef={footerRef}>
        <Footer />
      </FadeIn>
      <SelectWalletModal isOpen={isOpen} closeModal={onClose} />
    </div>
  );
};

export default Terminal;
