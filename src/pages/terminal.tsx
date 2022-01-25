import React from "react";
import AceEditor from "react-ace";

import "ace-builds/src-noconflict/mode-jade";
import "ace-builds/src-noconflict/theme-vibrant_ink";

import { codename } from "../assets/sponsors.json";
import { version } from "@1hive/evmcrispr/package.json";

import PageSkeleton from "../components/skeleton";
import Header from "../components/header";
import { useTerminal } from "../utils/useTerminal";

const Terminal = () => {
  const {
    error,
    loading,
    url,
    code,
    setCode,
    address,
    addressShortened,
    onClick,
    onForward,
    onConnect,
  } = useTerminal();

  return (
    <PageSkeleton>
      <Header
        terminalText={`evm-crispr ${
          codename ? `"${codename}"` : null
        } v${version}`}
        onClick={onClick}
      />

      <div className="terminal-code">
        <div className="content ">
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
        </div>
      </div>
    </PageSkeleton>
  );
};

export default Terminal;
