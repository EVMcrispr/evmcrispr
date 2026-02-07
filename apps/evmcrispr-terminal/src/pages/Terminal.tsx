import type { ChangeEventHandler } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollRestoration,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import _debounce from "lodash.debounce";

import { useAccount } from "wagmi";

import { useChain, useSpringRef } from "@react-spring/web";

import {
  terminalStoreActions,
  useTerminalStore,
} from "../components/TerminalEditor/use-terminal-store";

import FadeIn from "../components/animations/FadeIn";
import Footer from "../components/Footer";
import ActionButtons from "../components/ActionButtons";
import ConfigureButton from "../components/ConfigureButton";
import ShareScriptButton from "../components/ShareButton";
import Header from "../components/TerminalHeader";
import SaveScriptButton from "../components/SaveScript";
import ScriptLibrary from "../components/ScriptLibrary";
import TerminalEditor from "../components/TerminalEditor";
import { useScriptFromId } from "../hooks/useStoredScript";
import { getScriptSavedInLocalStorage } from "../utils";
import { useSafeAutoConnect } from "../hooks/useSafeAutoConnect";

export default function Terminal() {
  const [maximizeGasLimit, setMaximizeGasLimit] = useState(false);
  useSafeAutoConnect();

  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const footerRef = useSpringRef();

  const { address } = useAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const { title: titleFromId, script: scriptFromId } =
    useScriptFromId(params?.scriptId) || {};

  const { title: titleFromSession, script: scriptFromSession } =
    useTerminalStore();

  useChain([terminalRef, buttonsRef, footerRef]);

  // Set up a script if we have one in the URL
  useEffect(() => {
    const encodedParams = new URLSearchParams(
      window.location.hash.split("?")[1],
    );
    const encodedTitle = encodedParams.get("title");
    const encodedScript = encodedParams.get("script");
    if (encodedTitle || encodedScript) {
      terminalStoreActions("title", encodedTitle ?? "");
      terminalStoreActions("script", encodedScript ?? "");
      terminalStoreActions("processScript");
    }
  }, []);

  useEffect(() => {
    if (titleFromId !== undefined) {
      terminalStoreActions("title", titleFromId);
    }
  }, [titleFromId]);

  useEffect(() => {
    if (scriptFromId !== undefined) {
      terminalStoreActions("script", scriptFromId);
      terminalStoreActions("processScript");
    }
  }, [scriptFromId]);

  // We hide the scriptId when the title or the script change so they don't match anymore with the url
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (location.pathname !== "/terminal") {
      const { title: _title, script: _script } =
        getScriptSavedInLocalStorage(params.scriptId) ?? {};
      if (titleFromSession !== _title || scriptFromSession !== _script) {
        navigate("/terminal");
      }
    }
  }, [titleFromSession, scriptFromSession]);

  const toggleMaximizeGasLimit = useCallback(
    () => setMaximizeGasLimit((v) => !v),
    [],
  );

  return (
    <>
      <ScrollRestoration />
      <ScriptLibrary />
      <div className="mx-auto max-w-7xl 2xl:max-w-[90rem] my-14 px-4">
        <Header address={address} />
        <FadeIn componentRef={terminalRef}>
          <div className="flex flex-col items-end mb-3">
            <div className="flex w-full">
              <TitleInput />
              <div className="flex-1" />
              <div className="flex items-center gap-1">
                <SaveScriptButton
                  title={titleFromSession}
                  script={scriptFromSession}
                />
                <ShareScriptButton
                  title={titleFromSession}
                  script={scriptFromSession}
                />
                <ConfigureButton
                  setMaximizeGasLimit={{ toggle: toggleMaximizeGasLimit }}
                  maximizeGasLimit={maximizeGasLimit}
                />
              </div>
            </div>
          </div>
          <TerminalEditor />
        </FadeIn>
        <FadeIn componentRef={buttonsRef}>
          <ActionButtons
            address={address}
            maximizeGasLimit={maximizeGasLimit}
          />
        </FadeIn>
      </div>
      <FadeIn componentRef={footerRef}>
        <div className="mt-[200px]">
          <Footer />
        </div>
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
    setDocumentTitle(title);
  }, [title]);

  useEffect(() => {
    document.title = documentTitle
      ? `${documentTitle} - EVMcrispr Terminal`
      : "EVMcrispr Terminal";
  }, [documentTitle]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debounce = useCallback(
    // Delay saving state until user activity stops
    _debounce((_inputString: string) => {
      terminalStoreActions("title", _inputString);
    }, 200), // Delay (ms)
    [title],
  );

  const handleTitleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    setDocumentTitle(event.target.value);
    debounce(event.target.value);
  };
  return (
    <input
      ref={handleRef}
      type="text"
      placeholder="Untitled script"
      onChange={handleTitleChange}
      spellCheck="false"
      className="bg-transparent border-none outline-none text-4xl text-evm-gray-300 placeholder:text-evm-gray-300 placeholder:opacity-100 font-head w-full"
    />
  );
}
