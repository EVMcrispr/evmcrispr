import type {
  DocumentSymbol as CoreDocumentSymbol,
  ParseDiagnostic,
} from "@evmcrispr/core";
import type { Monaco } from "@monaco-editor/react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";
import { commandNames, helperNames } from "../../data/reference-data";
import { useEditorModels } from "../../hooks/useEditorModels";
import { useEditorState } from "../../hooks/useEditorState";
import {
  type CursorRef,
  SCRIPT_PLACEHOLDER,
  terminalStoreActions,
  terminalStoreGet,
  useTerminalStore,
} from "../../stores/terminal-store";
import { toMonacoCompletionItem } from "./autocompletion";
import { conf, contribution, createLanguage } from "./evml";
import { theme } from "./theme";

/** Detect whether the cursor is on a known command or @helper name. */
function detectCursorRef(line: string, col: number): CursorRef | null {
  // Check for @helper: find @identifier spanning the cursor
  // Walk backwards from col to find a preceding @
  const helperMatch = line.match(/@([\w.]+)/g);
  if (helperMatch) {
    let offset = 0;
    for (const m of helperMatch) {
      const idx = line.indexOf(m, offset);
      const end = idx + m.length;
      if (col >= idx && col <= end) {
        const name = m.slice(1); // strip @
        if (helperNames.has(name)) {
          return { name, kind: "helper" };
        }
      }
      offset = end;
    }
  }

  // Check for command: first word on the line (after optional whitespace,
  // and optionally after a module prefix like "ar:")
  const cmdMatch = line.match(/^\s*(?:[\w-]+:)?([\w-]+)/);
  if (cmdMatch) {
    const name = cmdMatch[1];
    const fullMatchStart = line.indexOf(cmdMatch[0]);
    const nameStart = fullMatchStart + cmdMatch[0].length - name.length;
    const nameEnd = nameStart + name.length;
    if (col >= nameStart && col <= nameEnd && commandNames.has(name)) {
      return { name, kind: "command" };
    }
  }

  return null;
}

export default function TerminalEditor() {
  const monaco = useMonaco();

  const { script, currentScriptId, executingLine } = useTerminalStore();
  const { evm, debouncedScript, commandKeywords, helperKeywords } =
    useEditorState(script);

  const scriptRef = useRef(script);
  scriptRef.current = script;

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(
    null,
  );
  const isReplayingRef = useRef(false);
  const mountedScriptIdRef = useRef<string | null>(null);

  const { setEditor, switchToScript } = useEditorModels();

  const handleOnChangeEditor = useCallback((str: string | undefined) => {
    if (isReplayingRef.current) return;
    terminalStoreActions("script", str ?? "");
  }, []);

  // When currentScriptId changes (script switch), swap the model
  useEffect(() => {
    if (!editorRef.current) return;
    if (currentScriptId === mountedScriptIdRef.current) return;
    mountedScriptIdRef.current = currentScriptId;

    isReplayingRef.current = true;
    const currentScript = terminalStoreGet("script");
    switchToScript(currentScriptId, currentScript);
    isReplayingRef.current = false;
  }, [currentScriptId, switchToScript]);

  // Syntax highlighting — update tokenizer when keywords change
  useEffect(() => {
    if (!monaco) return;

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
    if (!monaco) return;

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

  // Hover provider
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

  // Signature help
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

  // Document symbols
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

  // Inline diagnostics
  useEffect(() => {
    if (!monaco) return;

    const model = editorRef.current?.getModel();
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

  // Line highlighting during execution
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !monaco) return;

    if (!decorationsRef.current) {
      decorationsRef.current = ed.createDecorationsCollection([]);
    }

    if (executingLine != null) {
      decorationsRef.current.set([
        {
          range: new monaco.Range(executingLine, 1, executingLine, 1),
          options: {
            isWholeLine: true,
            className: "executing-line-highlight",
          },
        },
      ]);
      ed.revealLineInCenter(executingLine);
    } else {
      decorationsRef.current.set([]);
    }
  }, [executingLine, monaco]);

  function handleOnMountEditor(
    ed: editor.IStandaloneCodeEditor,
    monacoInstance: Monaco,
  ) {
    editorRef.current = ed;
    setEditor(ed, monacoInstance);

    const id = terminalStoreGet("currentScriptId");
    const currentScript = terminalStoreGet("script");
    mountedScriptIdRef.current = id;

    isReplayingRef.current = true;
    switchToScript(id, currentScript);
    isReplayingRef.current = false;

    // Track cursor position to detect command/helper under cursor
    ed.onDidChangeCursorPosition((e) => {
      const model = ed.getModel();
      if (!model) return;

      const line = model.getLineContent(e.position.lineNumber);
      const col = e.position.column - 1; // 0-indexed

      const ref = detectCursorRef(line, col);
      const prev = terminalStoreGet("cursorRef");
      if (prev?.name !== ref?.name || prev?.kind !== ref?.kind) {
        terminalStoreActions("cursorRef", ref);
      }
    });
  }

  return (
    <div className="relative w-full h-full">
      <MonacoEditor
        height="100%"
        theme="theme"
        language="evml"
        defaultValue={SCRIPT_PLACEHOLDER}
        onChange={handleOnChangeEditor}
        beforeMount={handleBeforeMountEditor}
        onMount={handleOnMountEditor}
        options={{
          fontSize: 22,
          fontFamily: "Ubuntu Mono",
          detectIndentation: false,
          quickSuggestionsDelay: 100,
          wordBasedSuggestions: "off",
          tabSize: 2,
          language: "evml",
          minimap: {
            enabled: false,
          },
          wordWrap: "on",
          scrollbar: {
            useShadows: false,
            verticalScrollbarSize: 7,
            vertical: "hidden",
            horizontal: "hidden",
            alwaysConsumeMouseWheel: false,
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
    </div>
  );
}
