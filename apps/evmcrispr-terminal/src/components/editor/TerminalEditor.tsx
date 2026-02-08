import { IPFSResolver } from "@evmcrispr/core";
import type { Monaco } from "@monaco-editor/react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import { useEffect } from "react";
import { usePublicClient } from "wagmi";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";
import { createProvideCompletionItemsFn } from "./autocompletion";
import { conf, contribution, createLanguage, getModulesKeywords } from "./evml";
import { theme } from "./theme";

export default function TerminalEditor() {
  const monaco = useMonaco();

  const ipfsResolver = new IPFSResolver();

  const { bindingsCache, script, ast, currentModuleNames } = useTerminalStore();

  const publicClient = usePublicClient();

  function handleOnChangeEditor(str: string | undefined, ev: any) {
    terminalStoreActions("script", str ?? "");

    const change = ev.changes[0];
    const startLineNumber = change.range.startLineNumber;
    const newLine = change.text
      ? change.text.split("\n").length +
        startLineNumber -
        // Substract current line
        1
      : startLineNumber;
    terminalStoreActions("updateCurrentLine", newLine);
  }

  useEffect(() => {
    terminalStoreActions("processScript");
  }, []);

  useEffect(() => {
    if (!monaco) {
      return;
    }
    const { commandKeywords, helperKeywords } = getModulesKeywords(
      currentModuleNames,
      bindingsCache,
    );

    const tokensProvider = monaco.languages.setMonarchTokensProvider(
      "evml",
      createLanguage(commandKeywords, helperKeywords),
    );

    return () => {
      tokensProvider.dispose();
    };
  }, [monaco, currentModuleNames, bindingsCache]);

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
