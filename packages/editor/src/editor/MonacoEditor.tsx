import type {
  DocumentSymbol as CoreDocumentSymbol,
  HoverRef,
  ParseDiagnostic,
} from "@evmcrispr/core";
import type { Monaco } from "@monaco-editor/react";
import MonacoEditorBase, { loader, useMonaco } from "@monaco-editor/react";

// Monaco is self-hosted: the AMD build is served from /vs on the app's own
// origin (dev middleware + build copy in the terminal's vite config) rather
// than a third-party CDN — injected <script> tags can't be hash-verified,
// so CDN trust is removed instead. Apps embedding this editor must serve
// monaco-editor@0.56.0/min/vs at /vs (or call loader.config to override).
// monaco-editor is pinned exact. 0.53–0.55 swallowed the first keystroke
// typed over a backward (right-to-left) selection on the textarea path
// (vscode#273146); 0.56.0 ships the fix. When bumping, re-test backward
// select + type in a browser without the EditContext API (e.g. Firefox).
loader.config({ paths: { vs: "/vs" } });

import type { editor, IPosition, languages } from "monaco-editor";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEvmlTag } from "../context/EvmcrisprProvider";
import { toMonacoCompletionItem } from "./autocompletion";
import { registerCircomLanguage } from "./circom-language";
import { conf, contribution, createLanguage } from "./evml";
import {
  findIpfsGetCallAt,
  getIpfsPreview,
  loadingPreview,
  peekIpfsPreview,
} from "./ipfs-preview";
import { registerNoirLanguage } from "./noir-language";
import { patchEmbeddedSolidity } from "./solidity-patch";
import { theme, themeWithBackground } from "./theme";

const SCRIPT_DEBOUNCE_MS = 300;
const CHANGE_DEBOUNCE_MS = 150;

/** Command id registered on Monaco for the hover panel's "Open in
 *  reference" link (see the hover provider effect below). */
const OPEN_DOCS_COMMAND_ID = "evmcrispr.openDocs";

export interface EditorProps {
  /** Initial script when the host isn't controlling the content. */
  defaultValue?: string;
  /** Debounced (150 ms) content-change notifications. The pending change
   *  is flushed on unmount so a fast edit → unmount never loses text. */
  onChange?: (value: string) => void;
  /** 1-based line currently being executed — highlighted + revealed. */
  executingLine?: number | null;
  /** Fired when the user clicks the "Open in reference" link in a hover
   *  card over a command or `@helper` name. */
  onOpenDocs?: (ref: HoverRef) => void;
  /** Escape hatch for hosts that manage Monaco models themselves (the
   *  terminal's script switching). Runs after the internal wiring. */
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  /** Fires after text is pasted, with the range the paste occupies. */
  onDidPaste?: (
    event: editor.IPasteEvent,
    editor: editor.IStandaloneCodeEditor,
  ) => void;
  /** Merged over the built-in editor options. */
  options?: editor.IStandaloneEditorConstructionOptions;
  /** Exact background color of the editor surface (e.g. "#121212").
   *  Monaco needs an opaque color — it can't inherit the host's — so a
   *  host that retints the terminal surface passes it here too. */
  background?: string;
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
  onOpenDocs,
  onMount,
  onDidPaste,
  options,
  background,
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
  // Commands/helpers get a trailing "Open in reference" command link so the
  // side panel can be opened explicitly instead of auto-activating whenever
  // the cursor happens to land on a recognised name.
  useEffect(() => {
    if (!monaco) return;

    const openDocsCommand = monaco.editor.registerCommand(
      OPEN_DOCS_COMMAND_ID,
      (_accessor, ref: HoverRef) => {
        onOpenDocsRef.current?.(ref);
      },
    );

    const hoverProvider = monaco.languages.registerHoverProvider("evml", {
      provideHover: async (model, pos) => {
        const info = await evm.getHoverInfo(model.getValue(), {
          line: pos.lineNumber,
          col: pos.column - 1,
        });
        if (!info) return null;
        const contents: Array<{ value: string; isTrusted?: boolean }> =
          info.contents.map((value) => ({ value }));
        if (info.ref) {
          const args = encodeURIComponent(JSON.stringify(info.ref));
          contents.push({
            value: `[Open in reference](command:${OPEN_DOCS_COMMAND_ID}?${args})`,
            isTrusted: true,
          });
        }
        return { contents };
      },
    });

    return () => {
      hoverProvider.dispose();
      openDocsCommand.dispose();
    };
  }, [monaco, evm]);

  // ── IPFS preview on hover ──
  // A second hover provider (Monaco merges results): hovering anywhere on an
  // `@ipfs.get("<cid>")` call shows a preview of the pinned file fetched from
  // the public gateway. The first hover answers instantly with a loading
  // placeholder; when the preview resolves, the hover is re-opened in place
  // (only if the mouse is still on the call).
  useEffect(() => {
    if (!monaco) return;

    let lastMousePos: { lineNumber: number; column: number } | null = null;
    const mouseMove = editorInstance?.onMouseMove((e) => {
      lastMousePos = e.target.position ?? null;
    });

    const ipfsHoverProvider = monaco.languages.registerHoverProvider("evml", {
      provideHover: (model, pos) => {
        const call = findIpfsGetCallAt(
          model.getLineContent(pos.lineNumber),
          pos.column,
        );
        if (!call) return null;
        const range = new monaco.Range(
          pos.lineNumber,
          call.startColumn,
          pos.lineNumber,
          call.endColumn,
        );

        const pending = getIpfsPreview(call.cid);
        const ready = peekIpfsPreview(call.cid);
        if (ready !== undefined) {
          return ready ? { range, contents: [{ value: ready }] } : null;
        }

        pending.then((value) => {
          const ed = editorInstance;
          if (!value || !ed || model.isDisposed() || ed.getModel() !== model)
            return;
          const p = lastMousePos;
          const stillOnCall =
            p?.lineNumber === pos.lineNumber &&
            p.column >= call.startColumn &&
            p.column <= call.endColumn;
          if (!stillOnCall) return;
          // Undocumented but stable on the pinned monaco 0.52.2; on
          // failure the user simply re-hovers to see the full preview.
          try {
            const contrib = ed.getContribution(
              "editor.contrib.contentHover",
            ) as unknown as {
              showContentHover?: (
                range: unknown,
                mode: number,
                source: number,
                focus: boolean,
              ) => void;
            } | null;
            contrib?.showContentHover?.(
              range,
              1, // HoverStartMode.Immediate
              0, // HoverStartSource.Mouse
              false,
            );
          } catch (_e) {
            // Preview stays cached; the next hover shows it.
          }
        });

        return { range, contents: [{ value: loadingPreview(call.cid) }] };
      },
    });

    return () => {
      mouseMove?.dispose();
      ipfsHoverProvider.dispose();
    };
  }, [monaco, editorInstance]);

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

  // ── Auto-import: writing a qualified name normalizes it ──
  // Typing (or pasting) `ens:renew` / `@ens:addr` rewrites the token to its
  // unqualified spelling and records it in the module's load import list
  // (creating `load ens [renew]` when missing). Only just-edited regions
  // are considered, only names that resolve to a real export, and only
  // when the unqualified spelling is free — Ctrl+Z restores the qualified
  // form (undo/redo never re-trigger the rewrite). Import lists also track
  // usage: entries whose usages were deleted are pruned, bare names a
  // loaded module exports are (re-)imported, and changed lists come back
  // sorted — so the pass runs on any edit while a load command exists.
  const applyingAutoImportRef = useRef(false);
  useEffect(() => {
    if (!editorInstance || !monaco || readOnly) return;

    const disposable = editorInstance.onDidChangeModelContent(async (e) => {
      if (
        applyingAutoImportRef.current ||
        e.isFlush ||
        e.isUndoing ||
        e.isRedoing
      ) {
        return;
      }
      const model = editorInstance.getModel();
      if (!model) return;

      const regions = e.changes.map((c) => {
        const inserted = c.text.split("\n");
        const endLine = c.range.startLineNumber + inserted.length - 1;
        const endCol =
          inserted.length === 1
            ? c.range.startColumn - 1 + c.text.length
            : inserted[inserted.length - 1].length;
        return {
          startLine: c.range.startLineNumber,
          startCol: c.range.startColumn - 1,
          endLine,
          endCol,
        };
      });

      // Cheap pre-filter: a qualified token needs a ":" on a changed line;
      // list pruning / re-imports need a load command somewhere.
      const lineCount = model.getLineCount();
      const touchesColon = regions.some((r) => {
        for (let l = r.startLine; l <= Math.min(r.endLine, lineCount); l++) {
          if (model.getLineContent(l).includes(":")) return true;
        }
        return false;
      });
      if (!touchesColon && !/^\s*load\s/m.test(model.getValue())) return;

      const version = model.getVersionId();
      const edits = await evm.getAutoImportEdits(model.getValue(), regions);
      if (
        edits.length === 0 ||
        model.getVersionId() !== version ||
        editorRef.current !== editorInstance
      ) {
        return;
      }

      applyingAutoImportRef.current = true;
      try {
        editorInstance.executeEdits(
          "evml-auto-import",
          edits.map((ed) => ({
            range: new monaco.Range(
              ed.line,
              ed.startCol + 1,
              ed.line,
              ed.endCol + 1,
            ),
            text: ed.newText,
          })),
        );
      } finally {
        applyingAutoImportRef.current = false;
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [editorInstance, monaco, evm, readOnly]);

  // ── Rename provider (F2 on imported names) ──
  useEffect(() => {
    if (!monaco) return;

    const renameProvider = monaco.languages.registerRenameProvider("evml", {
      resolveRenameLocation: (model, pos) => {
        const range = evm.prepareRename(model.getValue(), {
          line: pos.lineNumber,
          col: pos.column - 1,
        });
        if (!range) {
          return {
            rejectReason:
              "Only names bound by a load import list can be renamed.",
            range: new monaco.Range(
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column,
            ),
            text: "",
          };
        }
        return {
          range: new monaco.Range(
            range.line,
            range.startCol + 1,
            range.line,
            range.endCol + 1,
          ),
          text: range.text,
        };
      },
      provideRenameEdits: (model, pos, newName) => {
        const result = evm.getRenameEdits(
          model.getValue(),
          { line: pos.lineNumber, col: pos.column - 1 },
          newName,
        );
        if ("error" in result) {
          // Monaco shows resolveRenameLocation rejections inline at the
          // cursor, but a rejectReason from here only goes to the (absent
          // in standalone) notification service — surface it through the
          // same inline message controller for a consistent look.
          const messageController = editorRef.current?.getContribution(
            "editor.contrib.messageController",
          ) as {
            showMessage?: (message: string, position: IPosition) => void;
          } | null;
          messageController?.showMessage?.(result.error, pos);
          return { edits: [], rejectReason: result.error };
        }
        return {
          edits: result.edits.map((e) => ({
            resource: model.uri,
            versionId: undefined,
            textEdit: {
              range: new monaco.Range(
                e.line,
                e.startCol + 1,
                e.line,
                e.endCol + 1,
              ),
              text: e.newText,
            },
          })),
        };
      },
    });

    return () => {
      renameProvider.dispose();
    };
  }, [monaco, evm]);

  // ── Inline diagnostics ──
  // Diagnostics touching the cursor's line are withheld while editing: a
  // half-typed command is an error until the line is finished, and flashing
  // squiggles under the text being written is pure noise. The full set is
  // re-applied as soon as the cursor leaves the line (see the cursor
  // listener below).
  const diagnosticsRef = useRef<ParseDiagnostic[]>([]);
  const applyMarkersRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!monaco) return;

    const model = editorRef.current?.getModel();
    if (!model) return;

    let cancelled = false;

    const toMarker = (d: ParseDiagnostic) => ({
      startLineNumber: d.line,
      startColumn: d.col + 1,
      endLineNumber: d.endLine ?? d.line,
      endColumn:
        d.endCol != null ? d.endCol + 1 : model.getLineLength(d.line) + 1,
      message: d.message,
      severity:
        d.severity === "warning"
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Error,
    });

    const applyMarkers = () => {
      if (model.isDisposed()) return;
      // Only suppress while the editor is focused — an unfocused editor
      // isn't being typed in, so its cursor line should show its errors.
      const ed = editorRef.current;
      const cursorLine =
        readOnly || !ed?.hasTextFocus()
          ? null
          : (ed.getPosition()?.lineNumber ?? null);
      // Diagnostics can be stale relative to the model (they're computed
      // from the debounced script) — drop any that now point past the end
      // so `getLineLength` in `toMarker` can't throw.
      const lineCount = model.getLineCount();
      const visible = diagnosticsRef.current.filter(
        (d) =>
          d.line <= lineCount &&
          (cursorLine == null ||
            cursorLine < d.line ||
            cursorLine > (d.endLine ?? d.line)),
      );
      monaco.editor.setModelMarkers(model, "evml", visible.map(toMarker));
    };
    applyMarkersRef.current = applyMarkers;

    // Show fast parse-only diagnostics immediately, then upgrade to the full
    // set (parse + semantic) once the async analysis resolves.
    diagnosticsRef.current = evm.getDiagnostics(debouncedScript);
    applyMarkers();

    evm
      .getFullDiagnostics(debouncedScript)
      .then((diagnostics: ParseDiagnostic[]) => {
        if (cancelled) return;
        diagnosticsRef.current = diagnostics;
        applyMarkers();
      })
      .catch(() => {
        /* semantic analysis never throws, but stay defensive */
      });

    return () => {
      cancelled = true;
    };
  }, [monaco, evm, debouncedScript, readOnly]);

  // Re-apply markers when the cursor moves to a different line, so
  // diagnostics suppressed on the line being edited resurface once the
  // user moves off it (and get hidden on the newly entered line), and on
  // focus changes, so an unfocused editor shows its full diagnostics.
  useEffect(() => {
    if (!editorInstance || readOnly) return;

    let lastLine = editorInstance.getPosition()?.lineNumber ?? null;
    const disposables = [
      editorInstance.onDidChangeCursorPosition((e) => {
        if (e.position.lineNumber === lastLine) return;
        lastLine = e.position.lineNumber;
        applyMarkersRef.current();
      }),
      editorInstance.onDidFocusEditorText(() => applyMarkersRef.current()),
      editorInstance.onDidBlurEditorText(() => applyMarkersRef.current()),
    ];

    return () => {
      for (const d of disposables) d.dispose();
    };
  }, [editorInstance, readOnly]);

  // Monaco themes are global, keyed by name — a custom background gets its
  // own name so editors with different surfaces can coexist.
  const themeName = background
    ? `evml-dark-${background.replace(/[^a-zA-Z0-9]/g, "")}`
    : "evml-dark";

  const handleBeforeMountEditor = useCallback(
    (monaco: Monaco) => {
      monaco.editor.defineTheme("evml-dark", theme);
      if (background) {
        monaco.editor.defineTheme(themeName, themeWithBackground(background));
      }
      monaco.languages.register(contribution);
      monaco.languages.setLanguageConfiguration("evml", conf);
      patchEmbeddedSolidity(monaco);
      registerCircomLanguage(monaco);
      registerNoirLanguage(monaco);
    },
    [background, themeName],
  );

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

  const onOpenDocsRef = useRef(onOpenDocs);
  onOpenDocsRef.current = onOpenDocs;
  const onDidPasteRef = useRef(onDidPaste);
  onDidPasteRef.current = onDidPaste;

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

      ed.onDidPaste((e) => {
        onDidPasteRef.current?.(e, ed);
      });

      onMount?.(ed, monacoInstance);
    },
    [onMount],
  );

  const editorOptions = useMemo(() => {
    // Mirror the Shiki viewer's fixed gutter geometry (components.css):
    // the number column ends ~32px from the left edge, code starts at
    // 52px (3.25rem) and the script gets 8px (0.5rem) of top padding —
    // so toggling view ↔ edit doesn't shift the script. JetBrains Mono
    // digits advance 0.6em (Monaco rounds the measured width up).
    const fontSize = options?.fontSize ?? 22;
    const digitWidth = Math.ceil(fontSize * 0.6);
    const lineNumbersMinChars = Math.max(2, Math.round(32 / digitWidth));
    const lineDecorationsWidth = Math.max(
      4,
      52 - lineNumbersMinChars * digitWidth,
    );
    return {
      fontSize,
      fontFamily: "JetBrains Mono",
      detectIndentation: false,
      quickSuggestionsDelay: 100,
      wordBasedSuggestions: "off" as const,
      tabSize: 2,
      minimap: { enabled: false },
      wordWrap: "on" as const,
      // Match the Shiki viewer's CSS wrapping (`pre-wrap` +
      // `overflow-wrap: anywhere` in components.css): break only at
      // whitespace instead of Monaco's defaults, which split tokens like
      // "balanceOf(address)(uint256)" at parentheses. Whitespace must stay
      // in the after-list or Monaco falls back to breaking anywhere.
      // Monaco still force-breaks a token too wide to fit on a line by
      // itself, mirroring `overflow-wrap: anywhere`.
      wordWrapBreakBeforeCharacters: "",
      wordWrapBreakAfterCharacters: " \t",
      padding: { top: 8, bottom: 8 },
      lineNumbersMinChars,
      lineDecorationsWidth,
      // The viewer has no folding affordance; dropping it keeps the margin
      // width fully determined by the two knobs above.
      folding: false,
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
    };
  }, [options, readOnly]);

  return (
    <div className="relative w-full h-full">
      <MonacoEditorBase
        height={height}
        theme={themeName}
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
