import type {
  DocumentSymbol as CoreDocumentSymbol,
  ParseDiagnostic,
} from "@evmcrispr/core";
import type { Monaco } from "@monaco-editor/react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";
import { useEffect, useRef } from "react";
import { useEditorState } from "../../hooks/useEditorState";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";
import { toMonacoCompletionItem } from "./autocompletion";
import { conf, contribution, createLanguage } from "./evml";
import { theme } from "./theme";

export default function TerminalEditor() {
  const monaco = useMonaco();

  const { script } = useTerminalStore();
  const { evm, debouncedScript, commandKeywords, helperKeywords } =
    useEditorState(script);

  // Keep a ref so the completion closure always sees the latest script
  const scriptRef = useRef(script);
  scriptRef.current = script;

  function handleOnChangeEditor(str: string | undefined) {
    terminalStoreActions("script", str ?? "");
  }

  // Syntax highlighting — update tokenizer when keywords change
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

  // Completion provider
  useEffect(() => {
    if (!monaco) {
      return;
    }

    const completionProvider = monaco.languages.registerCompletionItemProvider(
      "evml",
      {
        provideCompletionItems: async (model, pos) => {
          const { startColumn, endColumn } = model.getWordUntilPosition(pos);
          const range = {
            startLineNumber: pos.lineNumber,
            endLineNumber: pos.lineNumber,
            startColumn,
            endColumn: model.getWordAtPosition(pos)?.endColumn ?? endColumn,
          };

          const items = await evm.getCompletions(scriptRef.current, {
            line: pos.lineNumber,
            col: pos.column - 1,
          });

          return {
            suggestions: items.map((coreItem) =>
              toMonacoCompletionItem(coreItem, range),
            ),
          };
        },
      },
    );

    return () => {
      completionProvider.dispose();
    };
  }, [monaco, evm]);

  // Hover provider — show signatures for commands, helpers, variables, options
  useEffect(() => {
    if (!monaco) return;

    const hoverProvider = monaco.languages.registerHoverProvider("evml", {
      provideHover: async (_model, pos) => {
        const info = await evm.getHoverInfo(scriptRef.current, {
          line: pos.lineNumber,
          col: pos.column - 1,
        });
        if (!info) return null;
        return {
          contents: [{ value: info.contents }],
        };
      },
    });

    return () => {
      hoverProvider.dispose();
    };
  }, [monaco, evm]);

  // Signature help — show parameter hints for helpers and commands
  useEffect(() => {
    if (!monaco) return;

    const sigHelpProvider = monaco.languages.registerSignatureHelpProvider(
      "evml",
      {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [",", " "],
        provideSignatureHelp: async (_model, pos) => {
          const result = await evm.getSignatureHelp(scriptRef.current, {
            line: pos.lineNumber,
            col: pos.column - 1,
          });
          if (!result) return null;
          return {
            value: {
              signatures: result.signatures.map((sig) => ({
                label: sig.label,
                documentation: sig.documentation,
                parameters: sig.parameters.map((p) => ({
                  label: p.label,
                  documentation: p.documentation,
                })),
              })),
              activeSignature: result.activeSignature,
              activeParameter: result.activeParameter,
            },
            dispose: () => {},
          };
        },
      },
    );

    return () => {
      sigHelpProvider.dispose();
    };
  }, [monaco, evm]);

  // Document symbols — expose script outline (top-level commands as symbols)
  useEffect(() => {
    if (!monaco) return;

    const { SymbolKind } = monaco.languages;
    const symbolKindMap: Record<string, number> = {
      command: SymbolKind.Function,
      block: SymbolKind.Module,
      variable: SymbolKind.Variable,
    };

    function toMonacoSymbol(sym: CoreDocumentSymbol): languages.DocumentSymbol {
      return {
        name: sym.name,
        detail: sym.detail ?? "",
        kind: symbolKindMap[sym.kind] ?? SymbolKind.Function,
        range: {
          startLineNumber: sym.range.startLine,
          startColumn: sym.range.startCol + 1,
          endLineNumber: sym.range.endLine,
          endColumn: sym.range.endCol + 1,
        },
        selectionRange: {
          startLineNumber: sym.selectionRange.startLine,
          startColumn: sym.selectionRange.startCol + 1,
          endLineNumber: sym.selectionRange.endLine,
          endColumn: sym.selectionRange.endCol + 1,
        },
        tags: [],
        children: sym.children?.map(toMonacoSymbol) ?? [],
      };
    }

    const symbolProvider = monaco.languages.registerDocumentSymbolProvider(
      "evml",
      {
        provideDocumentSymbols: (model) => {
          const symbols = evm.getDocumentSymbols(model.getValue());
          return symbols.map(toMonacoSymbol);
        },
      },
    );

    return () => {
      symbolProvider.dispose();
    };
  }, [monaco, evm]);

  // Inline diagnostics — show parse errors as markers
  useEffect(() => {
    if (!monaco) return;

    const model = monaco.editor.getModels()[0];
    if (!model) return;

    const diagnostics = evm.getDiagnostics(debouncedScript);

    monaco.editor.setModelMarkers(
      model,
      "evml",
      diagnostics.map((d: ParseDiagnostic) => ({
        startLineNumber: d.line,
        startColumn: d.col + 1,
        endLineNumber: d.line,
        endColumn: model.getLineLength(d.line) + 1,
        message: d.message,
        severity: monaco.MarkerSeverity.Error,
      })),
    );
  }, [monaco, evm, debouncedScript]);

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
        bracketPairColorization: {
          enabled: true,
        },
        guides: {
          bracketPairs: true,
          indentation: true,
        },
        stickyScroll: {
          enabled: true,
        },
      }}
    />
  );
}
