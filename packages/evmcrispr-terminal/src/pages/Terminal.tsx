import type { ChangeEventHandler } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollRestoration,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';

import _debounce from 'lodash.debounce';

import { useAccount, useConnect } from 'wagmi';

import { useChain, useSpringRef } from '@react-spring/web';
import {
  Box,
  Container,
  Flex,
  HStack,
  Input,
  Spacer,
  VStack,
  useBoolean,
} from '@chakra-ui/react';

import {
  terminalStoreActions,
  useTerminalStore,
} from '../components/TerminalEditor/use-terminal-store';

import FadeIn from '../components/animations/FadeIn';
import Footer from '../components/Footer';
import ActionButtons from '../components/ActionButtons';
import ConfigureButton from '../components/ConfigureButton';
import ShareScriptButton from '../components/ShareButton';
import Header from '../components/TerminalHeader';
import SaveScriptButton from '../components/SaveScript';
import ScriptLibrary from '../components/ScriptLibrary';
import TerminalEditor from '../components/TerminalEditor';
import { useScriptFromId } from '../hooks/useStoredScript';
import { getScriptSavedInLocalStorage } from '../utils';

export default function Terminal() {
  const [firstTry, setFirstTry] = useState(true);
  const [maximizeGasLimit, setMaximizeGasLimit] = useBoolean(false);

  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const footerRef = useSpringRef();

  const { data: account } = useAccount();
  const { connectors, connect, isConnected } = useConnect();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const { title: titleFromId, script: scriptFromId } =
    useScriptFromId(params?.scriptId) || {};

  const { title: titleFromSession, script: scriptFromSession } =
    useTerminalStore();

  const address = account?.address ?? '';

  useChain([terminalRef, buttonsRef, footerRef]);

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
    if (titleFromId !== undefined) {
      terminalStoreActions.title(titleFromId);
    }
  }, [titleFromId]);

  useEffect(() => {
    if (scriptFromId !== undefined) {
      terminalStoreActions.script(scriptFromId);
      terminalStoreActions.processScript();
    }
  }, [scriptFromId]);

  // We hide the scriptId when the title or the script change so they don't match anymore with the url
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (location.pathname !== '/terminal') {
      const { title: _title, script: _script } =
        getScriptSavedInLocalStorage(params.scriptId) ?? {};
      if (titleFromSession !== _title || scriptFromSession !== _script) {
        navigate('/terminal');
      }
    }
  }, [titleFromSession, scriptFromSession]);

  return (
    <>
      <ScrollRestoration />
      <ScriptLibrary />
      <Container maxWidth={{ base: '7xl', '2xl': '8xl' }} my={14}>
        <Header address={address} terminalStoreActions={terminalStoreActions} />
        <FadeIn componentRef={terminalRef}>
          <VStack mb={3} alignItems="flex-end" pr={0}>
            <Flex width={'100%'}>
              <TitleInput />
              <Spacer />
              <HStack spacing={1}>
                <SaveScriptButton
                  title={titleFromSession}
                  script={scriptFromSession}
                />
                <Spacer />
                <ShareScriptButton
                  title={titleFromSession}
                  script={scriptFromSession}
                />
                <Spacer />
                <ConfigureButton
                  setMaximizeGasLimit={setMaximizeGasLimit}
                  maximizeGasLimit={maximizeGasLimit}
                />
              </HStack>
            </Flex>
          </VStack>
          <TerminalEditor />
        </FadeIn>
        <FadeIn componentRef={buttonsRef}>
          <ActionButtons
            address={address}
            maximizeGasLimit={maximizeGasLimit}
          />
        </FadeIn>
      </Container>
      <FadeIn componentRef={footerRef}>
        <Box marginTop={'200px'}>
          <Footer />
        </Box>
      </FadeIn>
    </>
  );
}

function TitleInput() {
  // Set the default value, without enforcing its state.
  const handleRef = useRef<HTMLInputElement | null>(null);
  const { title } = useTerminalStore();
  useEffect(() => {
    if (handleRef.current) {
      handleRef.current.value = title;
    }
  }, [handleRef, title]);

  const [documentTitle, setDocumentTitle] = useState(title);

  useEffect(() => {
    document.title = documentTitle
      ? `${documentTitle} - EVMcrispr Terminal`
      : 'EVMcrispr Terminal';
  }, [documentTitle]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debounce = useCallback(
    // Delay saving state until user activity stops
    _debounce((_inputString: string) => {
      terminalStoreActions.title(_inputString);
    }, 200), // Delay (ms)
    [title],
  );

  const handleTitleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    setDocumentTitle(event.target.value);
    debounce(event.target.value);
  };
  return (
    <Input
      ref={handleRef}
      type="text"
      borderRadius="0"
      placeholder={'Untitled script'}
      onChange={handleTitleChange}
      variant={'unstyled'}
      fontSize={'4xl'}
      color={'gray.300'}
      _placeholder={{
        color: 'inherit',
        opacity: 1,
      }}
      spellCheck="false"
    />
  );
}
