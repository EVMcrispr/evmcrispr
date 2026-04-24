import { EVMcrispr } from "@evmcrispr/core";
import type { editor } from "monaco-editor";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { transports } from "../config/wagmi";

const SCRIPT_DEBOUNCE_MS = 300;

export function useEditorState(
  editorInstance: editor.IStandaloneCodeEditor | null,
) {
  const [debouncedScript, setDebouncedScript] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const client = usePublicClient();
  const evm = useMemo(
    () => new EVMcrispr(client, undefined, transports),
    [client],
  );

  useEffect(() => {
    if (!editorInstance) return;

    setDebouncedScript(editorInstance.getValue());

    const disposable = editorInstance.onDidChangeModelContent(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setDebouncedScript(editorInstance.getValue());
      }, SCRIPT_DEBOUNCE_MS);
    });

    return () => {
      disposable.dispose();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [editorInstance]);

  const [keywords, setKeywords] = useState<{
    commands: string[];
    helpers: string[];
  }>({ commands: [], helpers: [] });

  useEffect(() => {
    evm.getKeywords(debouncedScript).then(setKeywords);
    // Pre-resolve helper calls and `set` bindings so subsequent hovers can
    // render values (e.g. the address card under @ens / @token / $vars)
    // without making any new RPC calls at hover time.
    evm.prewarm(debouncedScript);
  }, [evm, debouncedScript]);

  return {
    evm,
    debouncedScript,
    commandKeywords: keywords.commands,
    helperKeywords: keywords.helpers,
  };
}
