import type {
  DocumentSymbol as CoreDocumentSymbol,
  ParseDiagnostic,
} from "@evmcrispr/core";
import type { Monaco } from "@monaco-editor/react";
import MonacoEditorBase, { useMonaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEvmlTag } from "../context/EvmcrisprProvider";
import { toMonacoCompletionItem } from "./autocompletion";
import { conf, contribution, createLanguage } from "./evml";
import { theme } from "./theme";

const SCRIPT_DEBOUNCE_MS = 300;
const CHANGE_DEBOUNCE_MS = 150;

export type CursorRef = {
  name: string;
  kind: "command" | "helper";
};

/** Detect whether the cursor is on a known command or @helper name. */
function detectCursorRef(
  line: string,
  col: number,
  commandNames: ReadonlySet<string>,
  helperNames: ReadonlySet<string>,
): CursorRef | null {
  // Check for @helper: find @identifier spanning the cursor
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

export interface EditorProps {
  /** Initial script when the host isn't controlling the content. */
  defaultValue?: string;
  /** Debounced (150 ms) content-change notifications. The pending change
   *  is flushed on unmount so a fast edit → unmount never loses text. */
  onChange?: (value: string) => void;
  /** 1-based line currently being executed — highlighted + revealed. */
  executingLine?: number | null;
  /** Notifies when the cursor lands on (or leaves) a known command /
   *  `@helper` name. Only fires on changes. */
  onCursorRef?: (ref: CursorRef | null) => void;
  /** Extra name sets recognised by `onCursorRef` detection. Defaults to
   *  the keywords the workspace reports for the current script. */
  commandNames?: ReadonlySet<string>;
  helperNames?: ReadonlySet<string>;
  /** Escape hatch for hosts that manage Monaco models themselves (the
   *  terminal's script switching). Runs after the internal wiring. */
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  /** Merged over the built-in editor options. */
  options?: editor.IStandaloneEditorConstructionOptions;
  readOnly?: boolean;
  height?: string | number;
}

/**
 * Monaco-based EVML editor wired to an `EvmlWorkspace` from the nearest
 * `EvmcrisprProvider`: completions, hover, signature help, document
 * symbols, inline diagnostics and keyword-driven syntax highlighting.
 */
function Editor({
  defaultValue,
  onChange,
  executingLine,
  onCursorRef,
  commandNames,
  helperNames,
  onMount,
  options,
  readOnly,
  height = "100%",
}: EditorProps) {
  const monaco = useMonaco();
  const tag = useEvmlTag();

  const evm = useMemo(() => tag.workspace(), [tag]);

  const [editorInstance, setEditorInstance] =
    useState<editor.IStandaloneCodeEditor | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(
    null,
  );

  // ── Debounced script (drives keywords, prewarm, diagnostics) ──
  const [debouncedScript, setDebouncedScript] = useState("");
  const scriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editorInstance) return;

    setDebouncedScript(editorInstance.getValue());

    const disposable = editorInstance.onDidChangeModelContent(() => {
      if (scriptTimerRef.current) clearTimeout(scriptTimerRef.current);
      scriptTimerRef.current = setTimeout(() => {
        scriptTimerRef.current = null;
        setDebouncedScript(editorInstance.getValue());
      }, SCRIPT_DEBOUNCE_MS);
    });

    return () => {
      disposable.dispose();
      if (scriptTimerRef.current) {
        clearTimeout(scriptTimerRef.current);
        scriptTimerRef.current = null;
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

  // ── Debounced onChange with flush-on-unmount ──
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      // Flush any pending debounced change before unmount. Without this,
      // unmounting within 150ms of typing throws away the latest edits:
      // Monaco's model may persist at module scope, but the host state
      // (which a read-only sibling view renders from) never receives the
      // update.
      if (changeTimerRef.current) {
        clearTimeout(changeTimerRef.current);
        changeTimerRef.current = null;
        const ed = editorRef.current;
        if (ed) {
          try {
            onChangeRef.current?.(ed.getValue());
          } catch {
            // editor disposed before we could read its value -- nothing
            // we can do, the next mount will re-derive from the model.
          }
        }
      }
    };
  }, []);

  // ── Syntax highlighting — update tokenizer when keywords change ──
  useEffect(() => {
    if (!monaco) return;

    const tokensProvider = monaco.languages.setMonarchTokensProvider(
      "evml",
      createLanguage(keywords.commands, keywords.helpers),
    );

    return () => {
      tokensProvider.dispose();
    };
  }, [monaco, keywords]);

  // ── Completion provider ──
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

  // ── Hover provider ──
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

  // ── Signature help ──
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

  // ── Document symbols ──
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

  // ── Inline diagnostics ──
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
    monaco.editor.defineTheme("evml-dark", theme);
    monaco.languages.register(contribution);
    monaco.languages.setLanguageConfiguration("evml", conf);
  }, []);

  // ── Line highlighting during execution ──
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

  // ── Cursor-ref detection ──
  const keywordsRef = useRef(keywords);
  keywordsRef.current = keywords;
  const cursorRefRef = useRef<CursorRef | null>(null);
  const onCursorRefRef = useRef(onCursorRef);
  onCursorRefRef.current = onCursorRef;
  const commandNamesRef = useRef(commandNames);
  commandNamesRef.current = commandNames;
  const helperNamesRef = useRef(helperNames);
  helperNamesRef.current = helperNames;

  const handleOnMountEditor = useCallback(
    (ed: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      editorRef.current = ed;
      setEditorInstance(ed);

      const CHANGE_MS = CHANGE_DEBOUNCE_MS;
      ed.onDidChangeModelContent(() => {
        if (!onChangeRef.current) return;
        if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
        changeTimerRef.current = setTimeout(() => {
          changeTimerRef.current = null;
          onChangeRef.current?.(ed.getValue());
        }, CHANGE_MS);
      });

      ed.onDidChangeCursorPosition((e) => {
        if (!onCursorRefRef.current) return;
        const model = ed.getModel();
        if (!model) return;

        const line = model.getLineContent(e.position.lineNumber);
        const col = e.position.column - 1;

        const ref = detectCursorRef(
          line,
          col,
          commandNamesRef.current ?? new Set(keywordsRef.current.commands),
          helperNamesRef.current ?? new Set(keywordsRef.current.helpers),
        );
        const prev = cursorRefRef.current;
        if (prev?.name !== ref?.name || prev?.kind !== ref?.kind) {
          cursorRefRef.current = ref;
          onCursorRefRef.current(ref);
        }
      });

      onMount?.(ed, monacoInstance);
    },
    [onMount],
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
      readOnly: readOnly ?? false,
      ...options,
    }),
    [options, readOnly],
  );

  return (
    <div className="relative w-full h-full">
      <MonacoEditorBase
        height={height}
        theme="evml-dark"
        language="evml"
        defaultValue={defaultValue}
        beforeMount={handleBeforeMountEditor}
        onMount={handleOnMountEditor}
        options={editorOptions}
      />
    </div>
  );
}

export { toMonacoCompletionItem } from "./autocompletion";
export default memo(Editor);
