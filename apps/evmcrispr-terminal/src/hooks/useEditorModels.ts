import type { Monaco } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";

import { SCRIPT_PLACEHOLDER } from "../stores/terminal-store";
import type { EditLog, EditOp, StoredEdit } from "../types";
import { getEditLog, saveEditLog } from "../utils";

const UNDO_GROUP_GAP_MS = 300;

// ---------------------------------------------------------------------------
// Module-level state shared across hook instances
// ---------------------------------------------------------------------------

const models = new Map<string, editor.ITextModel>();
const listeners = new Map<string, IDisposable>();

let activeEditor: editor.IStandaloneCodeEditor | null = null;

/**
 * Per-script in-memory edit buffer.  Flushed to localStorage periodically by
 * the auto-save system and before script switches / page unloads.
 */
const editBuffers = new Map<string, EditOp[]>();

let replayingModelUri: string | null = null;

// ---------------------------------------------------------------------------
// Edit-log replay
// ---------------------------------------------------------------------------

function replayEditLog(
  ed: editor.IStandaloneCodeEditor,
  model: editor.ITextModel,
  log: EditLog,
  monaco: Monaco,
) {
  const prevUri = replayingModelUri;
  replayingModelUri = model.uri.toString();
  try {
    model.setValue(log.base);

    let lastTs = 0;
    for (const op of log.ops) {
      if (op.ts - lastTs > UNDO_GROUP_GAP_MS) model.pushStackElement();
      ed.executeEdits(
        "replay",
        op.edits.map((e) => ({
          range: {
            startLineNumber: e.r[0],
            startColumn: e.r[1],
            endLineNumber: e.r[2],
            endColumn: e.r[3],
          },
          text: e.t,
        })),
        (inverseOps) => {
          if (inverseOps.length === 0) return null;
          const last = inverseOps[inverseOps.length - 1];
          const { lineNumber, column } = last.range.getEndPosition();
          return [new monaco.Selection(lineNumber, column, lineNumber, column)];
        },
      );
      lastTs = op.ts;
    }

    model.pushStackElement();
  } finally {
    replayingModelUri = prevUri;
  }
}

// ---------------------------------------------------------------------------
// Content-change listener (captures edits into the in-memory buffer)
// ---------------------------------------------------------------------------

function attachContentListener(model: editor.ITextModel) {
  const uri = model.uri.toString();
  // Models are disposed on editor unmount and recreated with the same URI;
  // a stale disposable left in the map would mean the new model gets no
  // listener and its edits never reach the edit log.
  listeners.get(uri)?.dispose();

  const disposable = model.onDidChangeContent((e) => {
    if (replayingModelUri === uri) return;

    const edits: StoredEdit[] = e.changes.map((c) => ({
      r: [
        c.range.startLineNumber,
        c.range.startColumn,
        c.range.endLineNumber,
        c.range.endColumn,
      ],
      t: c.text,
    }));

    let buf = editBuffers.get(uri);
    if (!buf) {
      buf = [];
      editBuffers.set(uri, buf);
    }
    buf.push({ edits, ts: Date.now(), source: "user" });
  });

  listeners.set(uri, disposable);
}

// ---------------------------------------------------------------------------
// Public helpers (non-hook, callable from anywhere)
// ---------------------------------------------------------------------------

/**
 * Flush the in-memory edit buffer for `scriptId` into localStorage.
 * Called by the auto-save system and before script switches.
 */
export function flushEditBuffer(scriptId: string) {
  const uri = `script://${scriptId}`;
  const buf = editBuffers.get(uri);
  if (!buf || buf.length === 0) return;

  const existing = getEditLog(scriptId);
  if (existing) {
    existing.ops.push(...buf);
    saveEditLog(scriptId, existing);
  } else {
    // No prior log — the model's current value already reflects the buffered
    // ops, so store it as the base. Fine-grained undo for these edits is lost
    // but the content is preserved.
    const model = models.get(scriptId);
    saveEditLog(scriptId, { base: model?.getValue() ?? "", ops: [] });
  }

  buf.length = 0;
}

/**
 * Return the buffered ops for `scriptId` and clear the buffer WITHOUT writing
 * them to the edit log. Used by the AI edit path to re-stamp the op it just
 * caused (source/revision metadata) before persisting it itself.
 */
export function drainEditBuffer(scriptId: string): EditOp[] {
  const buf = editBuffers.get(`script://${scriptId}`);
  if (!buf || buf.length === 0) return [];
  const ops = buf.slice();
  buf.length = 0;
  return ops;
}

/**
 * The Monaco model currently displayed in the editor, if mounted.
 */
export function getActiveModel(): editor.ITextModel | null {
  const model = activeEditor?.getModel();
  return model && !model.isDisposed() ? model : null;
}

export type EditResult = { ok: true } | { ok: false; error: string };

function withActiveEditor(
  fn: (
    ed: editor.IStandaloneCodeEditor,
    model: editor.ITextModel,
  ) => EditResult,
): EditResult {
  const ed = activeEditor;
  const model = ed?.getModel();
  if (!ed || !model) return { ok: false, error: "Editor is not mounted yet." };
  return fn(ed, model);
}

/**
 * Apply a str_replace-style edit to the active model. `oldStr` must match the
 * current content exactly once. The edit goes through `executeEdits`, so it is
 * captured by the edit log and undoable as a single step.
 *
 * Error messages are written for an LLM caller: they say what to do next.
 */
export function applyStrReplace(oldStr: string, newStr: string): EditResult {
  return withActiveEditor((ed, model) => {
    if (oldStr === "")
      return {
        ok: false,
        error:
          "old_string must not be empty. Use write_script to replace the whole script.",
      };

    const text = model.getValue();
    let count = 0;
    for (
      let i = text.indexOf(oldStr);
      i !== -1;
      i = text.indexOf(oldStr, i + oldStr.length)
    )
      count++;
    if (count === 0)
      return {
        ok: false,
        error:
          "old_string was not found in the script. It must match the current content exactly, including whitespace. Call get_script to re-read the current content.",
      };
    if (count > 1)
      return {
        ok: false,
        error: `old_string matches ${count} times. Include more surrounding lines so it is unique.`,
      };

    const offset = text.indexOf(oldStr);
    const start = model.getPositionAt(offset);
    const end = model.getPositionAt(offset + oldStr.length);
    model.pushStackElement();
    ed.executeEdits("ai-chat", [
      {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
        text: newStr,
      },
    ]);
    model.pushStackElement();
    return { ok: true };
  });
}

/**
 * Replace the entire script content. Uses `executeEdits` over the full range
 * (not `setValue`, which would reset the undo stack), so the replacement is
 * undoable as a single step.
 */
export function replaceScript(content: string): EditResult {
  return withActiveEditor((ed, model) => {
    model.pushStackElement();
    ed.executeEdits("ai-chat", [
      { range: model.getFullModelRange(), text: content },
    ]);
    model.pushStackElement();
    return { ok: true };
  });
}

/**
 * Dispose a model and clean up its edit buffer + listener.
 */
export function disposeModel(scriptId: string) {
  const model = models.get(scriptId);
  if (!model) return;
  const uri = model.uri.toString();

  listeners.get(uri)?.dispose();
  listeners.delete(uri);
  editBuffers.delete(uri);
  model.dispose();
  models.delete(scriptId);
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useEditorModels() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const setEditor = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = ed;
      monacoRef.current = monaco;
      activeEditor = ed;
    },
    [],
  );

  // The editor unmounts when the terminal switches to view mode — drop the
  // module-level handle so `getActiveModel` doesn't return a disposed editor.
  useEffect(() => {
    return () => {
      if (editorRef.current && activeEditor === editorRef.current)
        activeEditor = null;
    };
  }, []);

  const getOrCreateModel = useCallback(
    (scriptId: string, content: string): editor.ITextModel | null => {
      const m = monacoRef.current;
      if (!m) return null;

      const existing = models.get(scriptId);
      if (existing && !existing.isDisposed()) return existing;

      const uri = m.Uri.parse(`script://${scriptId}`);
      const model = m.editor.createModel(content, "evml", uri);
      models.set(scriptId, model);
      attachContentListener(model);
      return model;
    },
    [],
  );

  /**
   * Switch the editor to display the given script.
   * - Within a session: swaps to the existing model (undo stack intact).
   * - Cold start: creates the model and replays the edit log.
   *
   * Returns true if a replay happened (caller should gate onChange).
   */
  const switchToScript = useCallback(
    (scriptId: string | null, content?: string): boolean => {
      const ed = editorRef.current;
      if (!ed) return false;

      if (!scriptId) {
        const model = ed.getModel();
        if (model) model.setValue(content ?? SCRIPT_PLACEHOLDER);
        return false;
      }

      const alreadyCached =
        models.has(scriptId) && !models.get(scriptId)!.isDisposed();
      const model = getOrCreateModel(scriptId, content ?? SCRIPT_PLACEHOLDER);
      if (!model) return false;

      ed.setModel(model);

      let didReplay = false;

      if (!alreadyCached) {
        const log = getEditLog(scriptId);
        if (log && log.ops.length > 0 && monacoRef.current) {
          replayEditLog(ed, model, log, monacoRef.current);
          didReplay = true;
          // A log that doesn't reproduce the saved script is corrupt (e.g.
          // ops captured while the content listener was broken). The saved
          // script wins; re-base the log on it.
          if (content !== undefined && model.getValue() !== content) {
            const prevUri = replayingModelUri;
            replayingModelUri = model.uri.toString();
            try {
              model.setValue(content);
            } finally {
              replayingModelUri = prevUri;
            }
            saveEditLog(scriptId, { base: content, ops: [] });
          }
        } else if (content && model.getValue() !== content) {
          model.setValue(content);
        }
        // Initialise a fresh edit log so future edits are captured relative
        // to the current content.
        if (!getEditLog(scriptId)) {
          saveEditLog(scriptId, { base: model.getValue(), ops: [] });
        }
      }

      ed.setPosition({
        lineNumber: model.getLineCount(),
        column: 1,
      });
      ed.focus();

      return didReplay;
    },
    [getOrCreateModel],
  );

  return { setEditor, switchToScript };
}
