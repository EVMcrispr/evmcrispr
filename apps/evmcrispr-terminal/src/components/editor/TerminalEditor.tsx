import type { CursorRef } from "@evmcrispr/editor";
import MonacoEditor from "@evmcrispr/editor/monaco";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { memo, useCallback, useEffect, useRef } from "react";
import { commandNames, helperNames } from "../../data/reference-data";
import { useEditorModels } from "../../hooks/useEditorModels";
import {
  SCRIPT_PLACEHOLDER,
  terminalStoreActions,
  terminalStoreGet,
  useTerminalStore,
} from "../../stores/terminal-store";
import { interceptImagePaste } from "../../utils/file-upload";
import {
  offloadPastedHex,
  trackOffloadBypassKeys,
} from "../../utils/hex-offload";
import EditorDropZone from "./EditorDropZone";

/**
 * Store glue around the embeddable `@evmcrispr/editor` Monaco component:
 * syncs content into the terminal store, drives per-script model
 * switching (undo stacks, edit-log replay) and forwards cursor-ref
 * detection to the reference side panel.
 */
function TerminalEditor() {
  const currentScriptId = useTerminalStore((s) => s.currentScriptId);
  const executingLine = useTerminalStore((s) => s.executingLine);

  const { setEditor, switchToScript } = useEditorModels();
  const mountedScriptIdRef = useRef<string | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // When currentScriptId changes (script switch), swap the model
  useEffect(() => {
    if (currentScriptId === mountedScriptIdRef.current) return;
    mountedScriptIdRef.current = currentScriptId;
    switchToScript(currentScriptId, terminalStoreGet("script"));
  }, [currentScriptId, switchToScript]);

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = ed;
      setEditor(ed, monaco);
      trackOffloadBypassKeys(ed);
      interceptImagePaste(ed);
      const id = terminalStoreGet("currentScriptId");
      mountedScriptIdRef.current = id;
      switchToScript(id, terminalStoreGet("script"));
    },
    [setEditor, switchToScript],
  );

  const handleChange = useCallback((value: string) => {
    terminalStoreActions("script", value);
  }, []);

  const handleCursorRef = useCallback((ref: CursorRef | null) => {
    terminalStoreActions("cursorRef", ref);
  }, []);

  const handleDidPaste = useCallback(
    (e: editor.IPasteEvent, ed: editor.IStandaloneCodeEditor) => {
      void offloadPastedHex(e, ed);
    },
    [],
  );

  return (
    <EditorDropZone getEditor={() => editorRef.current}>
      <MonacoEditor
        defaultValue={SCRIPT_PLACEHOLDER}
        onChange={handleChange}
        executingLine={executingLine}
        onCursorRef={handleCursorRef}
        commandNames={commandNames}
        helperNames={helperNames}
        onMount={handleMount}
        onDidPaste={handleDidPaste}
      />
    </EditorDropZone>
  );
}

export default memo(TerminalEditor);
