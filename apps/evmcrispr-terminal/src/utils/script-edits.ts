import type { editor } from "monaco-editor";
import {
  applyStrReplace,
  drainEditBuffer,
  type EditResult,
  flushEditBuffer,
  getActiveModel,
  replaceScript,
} from "../hooks/useEditorModels";
import {
  terminalStoreActions,
  terminalStoreGet,
} from "../stores/terminal-store";
import type { EditLog, StoredEdit } from "../types";
import { getEditLog, saveEditLog, saveScript } from "./local-storage";

export type StoreEditResult =
  | { ok: true; revisionId?: string }
  | { ok: false; error: string };

function positionAt(text: string, offset: number): [number, number] {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return [lines.length, (lines.at(-1)?.length ?? 0) + 1];
}

function rangeForOffsets(
  text: string,
  startOffset: number,
  endOffset: number,
): StoredEdit["r"] {
  const [startLine, startCol] = positionAt(text, startOffset);
  const [endLine, endCol] = positionAt(text, endOffset);
  return [startLine, startCol, endLine, endCol];
}

/** The mounted Monaco model for `scriptId`, if the editor shows it. */
function mountedModelFor(scriptId: string): editor.ITextModel | null {
  const model = getActiveModel();
  return model && model.uri.toString() === `script://${scriptId}`
    ? model
    : null;
}

function commitStoreEdit(
  before: string,
  after: string,
  edit: StoredEdit,
): StoreEditResult {
  const scriptId = terminalStoreGet("currentScriptId");
  if (!scriptId) return { ok: false, error: "No script is currently loaded." };

  // User edits still buffered in memory happened before this edit — land them
  // in the log first so replay order matches document order.
  flushEditBuffer(scriptId);

  const revisionId = crypto.randomUUID();
  const log: EditLog = getEditLog(scriptId) ?? { base: before, ops: [] };
  log.ops.push({
    edits: [edit],
    ts: Date.now(),
    source: "ai-chat",
    revisionId,
    revisionBefore: before,
    revisionAfter: after,
  });
  saveEditLog(scriptId, log);

  terminalStoreActions("script", after);
  saveScript(scriptId, terminalStoreGet("title"), after);
  return { ok: true, revisionId };
}

/**
 * Apply an AI edit through the mounted editor: flush the user buffer, apply
 * via `executeEdits` (visible update + undo stack + store sync through the
 * editor's onChange), then move the captured op into the persisted log
 * stamped as an undoable ai-chat revision.
 */
function commitEditorEdit(
  scriptId: string,
  model: editor.ITextModel,
  apply: () => EditResult,
): StoreEditResult {
  flushEditBuffer(scriptId);

  const before = model.getValue();
  const applied = apply();
  if (!applied.ok) return applied;
  const after = model.getValue();

  const captured = drainEditBuffer(scriptId);
  if (captured.length === 0) return { ok: true }; // no-op edit — nothing to undo

  const revisionId = crypto.randomUUID();
  const log: EditLog = getEditLog(scriptId) ?? { base: before, ops: [] };
  const ops = captured.map((op) => ({ ...op, source: "ai-chat" as const }));
  Object.assign(ops[ops.length - 1], {
    revisionId,
    revisionBefore: before,
    revisionAfter: after,
  });
  log.ops.push(...ops);
  saveEditLog(scriptId, log);
  saveScript(scriptId, terminalStoreGet("title"), after);
  return { ok: true, revisionId };
}

export function applyStrReplaceInStore(
  oldString: string,
  newString: string,
): StoreEditResult {
  if (oldString === "") {
    return {
      ok: false,
      error:
        "old_string must not be empty. Use write_script to replace the whole script.",
    };
  }

  const script = terminalStoreGet("script");
  let matches = 0;
  for (
    let offset = script.indexOf(oldString);
    offset !== -1;
    offset = script.indexOf(oldString, offset + oldString.length)
  ) {
    matches++;
  }

  if (matches === 0) {
    return {
      ok: false,
      error:
        "old_string was not found in the script. It must match the current content exactly, including whitespace. Call get_script to re-read the current content.",
    };
  }
  if (matches > 1) {
    return {
      ok: false,
      error: `old_string matches ${matches} times. Include more surrounding lines so it is unique.`,
    };
  }

  const offset = script.indexOf(oldString);
  const after =
    script.slice(0, offset) +
    newString +
    script.slice(offset + oldString.length);

  return commitStoreEdit(script, after, {
    r: rangeForOffsets(script, offset, offset + oldString.length),
    t: newString,
  });
}

export function replaceScriptInStore(content: string): StoreEditResult {
  const script = terminalStoreGet("script");
  return commitStoreEdit(script, content, {
    r: rangeForOffsets(script, 0, script.length),
    t: content,
  });
}

/**
 * AI str_replace edit. Goes through the mounted editor when it shows the
 * current script (visible update + Monaco undo), through the store otherwise
 * (view mode / mobile). Both paths record an undoable ai-chat revision.
 */
export function applyAiStrReplace(
  oldString: string,
  newString: string,
): StoreEditResult {
  const scriptId = terminalStoreGet("currentScriptId");
  const model = scriptId ? mountedModelFor(scriptId) : null;
  if (scriptId && model) {
    return commitEditorEdit(scriptId, model, () =>
      applyStrReplace(oldString, newString),
    );
  }
  if (!scriptId && getActiveModel())
    return applyStrReplace(oldString, newString);
  return applyStrReplaceInStore(oldString, newString);
}

/** AI whole-script replacement. Same routing as {@link applyAiStrReplace}. */
export function applyAiWriteScript(content: string): StoreEditResult {
  const scriptId = terminalStoreGet("currentScriptId");
  const model = scriptId ? mountedModelFor(scriptId) : null;
  if (scriptId && model) {
    return commitEditorEdit(scriptId, model, () => replaceScript(content));
  }
  if (!scriptId && getActiveModel()) return replaceScript(content);
  return replaceScriptInStore(content);
}

export function undoScriptRevision(revisionId: string): StoreEditResult {
  const scriptId = terminalStoreGet("currentScriptId");
  if (!scriptId) return { ok: false, error: "No script is currently loaded." };

  // Land buffered user edits first: if the user typed since the revision, the
  // op is no longer last and the undo is correctly refused.
  flushEditBuffer(scriptId);

  const log = getEditLog(scriptId);
  const index = log?.ops.findIndex((op) => op.revisionId === revisionId) ?? -1;
  if (!log || index === -1) {
    return { ok: false, error: "This revision is no longer available." };
  }

  const revision = log.ops[index];
  const model = mountedModelFor(scriptId);
  const current = model ? model.getValue() : terminalStoreGet("script");
  if (
    index !== log.ops.length - 1 ||
    revision.source !== "ai-chat" ||
    revision.revisionBefore === undefined ||
    revision.revisionAfter === undefined ||
    current !== revision.revisionAfter
  ) {
    return {
      ok: false,
      error: "The script changed after this revision, so it cannot be undone.",
    };
  }

  if (model) {
    // Editor mounted: revert through `executeEdits` so the model, its undo
    // stack and the store stay in sync — and record the revert as a new op
    // instead of popping, so the log still replays to what the listener saw.
    const applied = replaceScript(revision.revisionBefore);
    if (!applied.ok) return applied;
    const captured = drainEditBuffer(scriptId);
    const fresh = getEditLog(scriptId) ?? {
      base: revision.revisionBefore,
      ops: [],
    };
    fresh.ops.push(
      ...captured.map((op) => ({ ...op, source: "ai-chat" as const })),
    );
    saveEditLog(scriptId, fresh);
    saveScript(scriptId, terminalStoreGet("title"), revision.revisionBefore);
    return { ok: true, revisionId };
  }

  // No editor: revert the store and drop the op (replay stays consistent).
  log.ops.pop();
  saveEditLog(scriptId, log);
  terminalStoreActions("script", revision.revisionBefore);
  saveScript(scriptId, terminalStoreGet("title"), revision.revisionBefore);
  return { ok: true, revisionId };
}
