import { useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useChain, useSpringRef } from '@react-spring/web';
import { Box, Button, VStack, useDisclosure } from '@chakra-ui/react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';

import SelectWalletModal from '../components/modal';
import FadeIn from '../components/animations/fade-in';

import { theme } from '../editor/theme';
import { conf, contribution, language } from '../editor/evmcl';

import { useTerminal } from '../utils/useTerminal';
import Footer from '../components/footer';
import pinJSON from '../api/pinata/pinJSON';
import fetchPin from '../api/pinata/fetchPin';

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
  const params = useParams();
  const navigate = useNavigate();

  const { data, error: fetchError } = useSWR(
    ['https://gateway.pinata.cloud', params?.hashId],
    (url, hashId) => fetchPin(url, hashId),
  );

  useEffect(() => {
    if (data !== null && !fetchError && typeof data !== 'undefined') {
      setCode(data.text);
    }
  }, [data]);

  const terminalCodeWithDate = () => ({
    text: code,
    date: new Date().toISOString(),
  });

  const getRootLocation = () => {
    const url = window.location.href;
    const urlArr = url.split('/');
    const urlWithoutHash = urlArr.filter((u) => u !== params.hashId);

    return urlWithoutHash.join('/');
  };

  const handleShare = async () => {
    const data = terminalCodeWithDate();

    try {
      const { IpfsHash } = await pinJSON(data);
      const root = params?.hashId ? getRootLocation() : window.location.href;
      const url = root + '/' + IpfsHash;

      navigator.clipboard.writeText(url);

      return navigate(`/terminal/${IpfsHash}`, { replace: true });
    } catch (e) {
      console.log(e);
    }
  };

  useChain([terminalRef, buttonsRef, footerRef]);

  return (
    <>
      <Box maxWidth="956px" margin="0 auto" my={16}>
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
          <VStack mt={3} alignItems="flex-end" gap={3} pr={{ base: 6, lg: 0 }}>
            {!address ? (
              <>
                <Button variant="lime" onClick={onOpen}>
                  Connect
                </Button>
                <Button onClick={handleShare}>Share</Button>
              </>
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

                <Button variant="lime" onClick={onForward}>
                  {`${
                    loading ? 'Forwarding' : 'Forward'
                  } from ${addressShortened}`}
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

            {error ? (
              <Button variant="warning">
                {error ? 'Error: ' + error : null}
              </Button>
            ) : null}
          </VStack>
        </FadeIn>
      </Box>
      <FadeIn componentRef={footerRef}>
        <Footer />
      </FadeIn>
      <SelectWalletModal isOpen={isOpen} closeModal={onClose} />
    </>
  );
};

export default Terminal;
