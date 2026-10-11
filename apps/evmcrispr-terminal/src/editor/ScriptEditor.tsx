import type { HoverRef } from "@evmcrispr/core";
import MonacoEditor from "@evmcrispr/editor/monaco";
import { titleLine } from "@evmcrispr/space";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useScript, useSpace } from "../app/SpaceContext";
import { setUi, useUi } from "../app/ui-store";
import EditorDropZone from "./EditorDropZone";
import { interceptImagePaste } from "./file-upload";
import { offloadPastedHex, trackOffloadBypassKeys } from "./hex-offload";
import { bindMonaco } from "./monaco-binding";

function openDocs(ref: HoverRef) {
  setUi({ docsRequest: { ...ref, ts: Date.now() } });
}

/**
 * The terminal's glue around the embeddable `@evmcrispr/editor` Monaco
 * component: it shows the space on screen through a model bound to that
 * space's document, and hands Ctrl+Z to the space.
 */
function offload(e: editor.IPasteEvent, ed: editor.IStandaloneCodeEditor) {
  void offloadPastedHex(e, ed);
}

function ScriptEditor() {
  const space = useSpace();
  const { text } = useScript();
  const executingLine = useUi((s) => s.executingLine);
  const [mounted, setMounted] = useState<{
    editor: editor.IStandaloneCodeEditor;
    monaco: Monaco;
  } | null>(null);
  // Commands are registered once; they act on whichever space is shown.
  const spaceRef = useRef(space);
  spaceRef.current = space;
  // Cursor and scroll of the spaces visited while the editor is mounted.
  const viewStates = useRef(
    new Map<string, editor.ICodeEditorViewState | null>(),
  );

  // One model per space shown, made from the document and bound to it for
  // as long as it is on screen. Typing, paste and drop reach the document
  // through the binding; everything else reaches the model through it.
  useEffect(() => {
    if (!mounted) return;
    const { editor: ed, monaco } = mounted;
    const model = monaco.editor.createModel(
      space.getText(),
      "evml",
      monaco.Uri.parse(`space://${space.id}`),
    );
    const binding = bindMonaco(monaco, model, space.text, () => [ed]);
    ed.setModel(model);
    ed.restoreViewState(viewStates.current.get(space.id) ?? null);
    const states = viewStates.current;
    return () => {
      states.set(space.id, ed.saveViewState());
      binding.dispose();
      model.dispose();
    };
  }, [mounted, space]);

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      trackOffloadBypassKeys(ed);
      interceptImagePaste(ed);
      // Undo belongs to the space, not to Monaco: changes that come from
      // the document (the assistant, a load, another tab) never enter
      // Monaco's own stack, and Ctrl+Z must cover the assistant's.
      const { KeyMod, KeyCode } = monaco;
      ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, () =>
        spaceRef.current.undo.undo(),
      );
      ed.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ, () =>
        spaceRef.current.undo.redo(),
      );
      ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyY, () =>
        spaceRef.current.undo.redo(),
      );
      setMounted({ editor: ed, monaco });
    },
    [],
  );

  return (
    <EditorDropZone getEditor={() => mounted?.editor ?? null}>
      <MonacoEditor
        executingLine={executingLine}
        titleLine={titleLine(text)}
        onOpenDocs={openDocs}
        onMount={handleMount}
        onDidPaste={offload}
      />
    </EditorDropZone>
  );
}

export default memo(ScriptEditor);
