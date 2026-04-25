import type {
  DocumentSymbol as CoreDocumentSymbol,
  ParseDiagnostic,
} from "@evmcrispr/core";
import type { Monaco } from "@monaco-editor/react";
import MonacoEditor, { useMonaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function TerminalEditor() {
  const monaco = useMonaco();

  const currentScriptId = useTerminalStore((s) => s.currentScriptId);
  const executingLine = useTerminalStore((s) => s.executingLine);

  const [editorInstance, setEditorInstance] =
    useState<editor.IStandaloneCodeEditor | null>(null);
  const { evm, debouncedScript, commandKeywords, helperKeywords } =
    useEditorState(editorInstance);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(
    null,
  );
  const isReplayingRef = useRef(false);
  const mountedScriptIdRef = useRef<string | null>(null);
  const storeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setEditor, switchToScript } = useEditorModels();

  useEffect(() => {
    return () => {
      // Flush any pending debounced sync before unmount. Without this,
      // toggling from edit -> view mode within 150ms of typing throws
      // away the latest edits: Monaco's model persists at module scope
      // (so re-mounting shows the new text), but the store -- which the
      // ScriptViewer reads from -- never receives the update, so the
      // viewer renders stale content.
      if (storeSyncTimerRef.current) {
        clearTimeout(storeSyncTimerRef.current);
        storeSyncTimerRef.current = null;
        const ed = editorRef.current;
        if (ed) {
          try {
            terminalStoreActions("script", ed.getValue());
          } catch {
            // editor disposed before we could read its value -- nothing
            // we can do, the next mount will re-derive from the model.
          }
        }
      }
    };
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

          const items = await evm.getCompletions(model.getValue(), {
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
      provideHover: async (model, pos) => {
        const info = await evm.getHoverInfo(model.getValue(), {
          line: pos.lineNumber,
          col: pos.column - 1,
        });
        if (!info) return null;
        return {
          contents: info.contents.map((value) => ({ value })),
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
        provideSignatureHelp: async (model, pos) => {
          const result = await evm.getSignatureHelp(model.getValue(), {
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

  const handleBeforeMountEditor = useCallback((monaco: Monaco) => {
    monaco.editor.defineTheme("theme", theme);
    monaco.languages.register(contribution);
    monaco.languages.setLanguageConfiguration("evml", conf);
  }, []);

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

  const handleOnMountEditor = useCallback(
    (ed: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      editorRef.current = ed;
      setEditorInstance(ed);
      setEditor(ed, monacoInstance);

      const id = terminalStoreGet("currentScriptId");
      const currentScript = terminalStoreGet("script");
      mountedScriptIdRef.current = id;

      isReplayingRef.current = true;
      switchToScript(id, currentScript);
      isReplayingRef.current = false;

      const STORE_SYNC_MS = 150;
      ed.onDidChangeModelContent(() => {
        if (isReplayingRef.current) return;
        if (storeSyncTimerRef.current) clearTimeout(storeSyncTimerRef.current);
        storeSyncTimerRef.current = setTimeout(() => {
          storeSyncTimerRef.current = null;
          terminalStoreActions("script", ed.getValue());
        }, STORE_SYNC_MS);
      });

      ed.onDidChangeCursorPosition((e) => {
        const model = ed.getModel();
        if (!model) return;

        const line = model.getLineContent(e.position.lineNumber);
        const col = e.position.column - 1;

        const ref = detectCursorRef(line, col);
        const prev = terminalStoreGet("cursorRef");
        if (prev?.name !== ref?.name || prev?.kind !== ref?.kind) {
          terminalStoreActions("cursorRef", ref);
        }
      });
    },
    [setEditor, switchToScript],
  );

  const editorOptions = useMemo(
    () => ({
      fontSize: 22,
      fontFamily: "Ubuntu Mono",
      detectIndentation: false,
      quickSuggestionsDelay: 100,
      wordBasedSuggestions: "off" as const,
      tabSize: 2,
      minimap: { enabled: false },
      wordWrap: "on" as const,
      scrollbar: {
        useShadows: false,
        verticalScrollbarSize: 7,
        vertical: "hidden" as const,
        horizontal: "hidden" as const,
        alwaysConsumeMouseWheel: false,
      },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      stickyScroll: { enabled: true },
      hover: { above: false },
    }),
    [],
  );

  return (
    <div className="relative w-full h-full">
      <MonacoEditor
        height="100%"
        theme="theme"
        language="evml"
        defaultValue={SCRIPT_PLACEHOLDER}
        beforeMount={handleBeforeMountEditor}
        onMount={handleOnMountEditor}
        options={editorOptions}
      />
    </div>
  );
}

export default memo(TerminalEditor);
