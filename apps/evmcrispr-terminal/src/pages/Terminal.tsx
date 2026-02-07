import { useCallback, useState } from "react";
import { ScrollRestoration } from "react-router-dom";

import Footer from "../components/layout/Footer";
import Header from "../components/layout/Header";
import ActionButtons from "../components/execution/ActionButtons";
import ConfigureButton from "../components/execution/ConfigureButton";
import SaveScriptButton from "../components/scripts/SaveScriptButton";
import ShareScriptButton from "../components/scripts/ShareScriptButton";
import ScriptLibrary from "../components/scripts/ScriptLibrary";
import TerminalEditor from "../components/editor/TerminalEditor";
import TitleInput from "../components/editor/TitleInput";
import { useTerminalScript } from "../hooks/useTerminalScript";
import { useWalletConnection } from "../hooks/useWalletConnection";

export default function Terminal() {
  const [maximizeGasLimit, setMaximizeGasLimit] = useState(false);

  const { address } = useWalletConnection();
  const { titleFromSession, scriptFromSession } = useTerminalScript();

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
        <div className="animate-fade-in">
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
        </div>
        <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <ActionButtons
            address={address}
            maximizeGasLimit={maximizeGasLimit}
          />
        </div>
      </div>
      <div
        className="animate-fade-in mt-[200px]"
        style={{ animationDelay: "0.2s" }}
      >
        <Footer />
      </div>
    </>
  );
}
