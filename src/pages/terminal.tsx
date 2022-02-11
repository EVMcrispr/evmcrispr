import React from "react";
import Editor from "@monaco-editor/react";

import { useTerminal } from "../utils/useTerminal";
import FadeIn from "../components/animations/fade-in";
import { useSpringRef, useChain } from "@react-spring/web";
import theme from 'monaco-themes/themes/Vibrant Ink.json';
import { contribution, conf, language } from '../editor/evmcl';

theme.colors["editor.lineHighlightBackground"] = "#333333";

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
    onConnect,
  } = useTerminal();
  const terminalRef = useSpringRef();
  const buttonsRef = useSpringRef();

  useChain([terminalRef, buttonsRef]);

  return (
    <div className="terminal-code">
      <div className="content ">
        <FadeIn componentRef={terminalRef}>
          <Editor
            height="50vh"
            theme="theme"
            language="evmcl"
            value={code}
            onChange={str => setCode(str || "")}
            beforeMount={monaco => {
              monaco.editor.defineTheme('theme', theme);
              monaco.languages.register(contribution);
              monaco.languages.setLanguageConfiguration("evmcl", conf);
              monaco.languages.setMonarchTokensProvider("evmcl", language);
            }}
            onMount={editor => {
              editor.setPosition({ lineNumber: 10000, column: 0 });
              editor.focus();
            }}
            options={{
              fontSize: 24,
              detectIndentation: false,
              tabSize: 2,
              language: "evmcl",
              minimap: {
                enabled: false
              },
              scrollbar: {
                useShadows: false,
                verticalScrollbarSize: 7,
              }
            }}
          />
        </FadeIn>
        <FadeIn componentRef={buttonsRef}>
          <div className="script-actions">
            {!address ? (
              <button className="button button-success" onClick={onConnect}>
                Connect
              </button>
            ) : (
              <>
                {url ? (
                  <button
                    className="button button-warning"
                    onClick={() => window.open(url, "_blank")}
                  >
                    Go to vote
                  </button>
                ) : null}

                <button className="button button-success" onClick={onForward}>
                  {`${
                    loading ? "Forwarding" : "Forward"
                  } from ${addressShortened}`}
                </button>
              </>
            )}

            {error && (
              <div
                className="button button-warning"
                style={{ cursor: "default" }}
              >
                {error ? "Error: " + error : null}
              </div>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
};

export default Terminal;
