import React from "react";
import AceEditor from "react-ace";

import "ace-builds/src-noconflict/mode-jade";
import "ace-builds/src-noconflict/theme-vibrant_ink";

import { useTerminal } from "../utils/useTerminal";
import FadeIn from "../components/animations/fade-in";
import { useSpringRef, useChain } from "@react-spring/web";

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
          <AceEditor
            width="100%"
            mode="jade"
            theme="vibrant_ink"
            name="code"
            value={code}
            onChange={setCode}
            focus={true}
            fontSize={24}
            showPrintMargin={true}
            showGutter={true}
            highlightActiveLine={true}
            setOptions={{
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: true,
              showLineNumbers: true,
              tabSize: 2,
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
