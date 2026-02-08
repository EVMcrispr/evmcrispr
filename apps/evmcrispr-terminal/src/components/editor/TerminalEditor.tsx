import { IPFSResolver } from "@evmcrispr/core";
import type { Monaco } from "@monaco-editor/react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import { useEffect, useMemo } from "react";
import { usePublicClient } from "wagmi";
import { useEditorState } from "../../hooks/useEditorState";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";
import { createProvideCompletionItemsFn } from "./autocompletion";
import { conf, contribution, createLanguage } from "./evml";
import { theme } from "./theme";

export default function TerminalEditor() {
  const monaco = useMonaco();

  const ipfsResolver = useMemo(() => new IPFSResolver(), []);

  const { script } = useTerminalStore();
  const { ast, bindingsCache, commandKeywords, helperKeywords } =
    useEditorState(script);

  const publicClient = usePublicClient();

  function handleOnChangeEditor(str: string | undefined) {
    terminalStoreActions("script", str ?? "");
  }

  useEffect(() => {
    if (!monaco) {
      return;
    }

    const tokensProvider = monaco.languages.setMonarchTokensProvider(
      "evml",
      createLanguage(commandKeywords, helperKeywords),
    );

    return () => {
      tokensProvider.dispose();
    };
  }, [monaco, commandKeywords, helperKeywords]);

  useEffect(() => {
    if (!monaco || !publicClient) {
      return;
    }
    const completionProvider = monaco.languages.registerCompletionItemProvider(
      "evml",
      {
        provideCompletionItems: createProvideCompletionItemsFn(
          bindingsCache,
          { client: publicClient, ipfsResolver },
          ast,
        ),
      },
    );

    return () => {
      completionProvider.dispose();
    };
  }, [bindingsCache, monaco, publicClient, ast, ipfsResolver]);

  function handleBeforeMountEditor(monaco: Monaco) {
    monaco.editor.defineTheme("theme", theme);
    monaco.languages.register(contribution);
    monaco.languages.setLanguageConfiguration("evml", conf);
  }

  function handleOnMountEditor(editor: any) {
    editor.setPosition({ lineNumber: 10000, column: 0 });
    editor.focus();
  }
  return (
    <MonacoEditor
      height="65vh"
      theme="theme"
      language="evml"
      value={script}
      onChange={handleOnChangeEditor}
      beforeMount={handleBeforeMountEditor}
      onMount={handleOnMountEditor}
      options={{
        fontSize: 22,
        fontFamily: "Ubuntu Mono",
        detectIndentation: false,
        quickSuggestionsDelay: 100,
        tabSize: 2,
        language: "evml",
        minimap: {
          enabled: false,
        },
        scrollbar: {
          useShadows: false,
          verticalScrollbarSize: 7,
          vertical: "hidden",
        },
      }}
    />
  );
}
