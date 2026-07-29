import { useEffect, useRef } from "react";

import {
  terminalStoreActions,
  terminalStoreGet,
  useTerminalStore,
} from "../stores/terminal-store";
import { saveScript, setLastViewedScript } from "../utils";
import { flushEditBuffer } from "./useEditorModels";

const AUTO_SAVE_DELAY = 1500;

export function useAutoSave() {
  const currentScriptId = useTerminalStore((s) => s.currentScriptId);
  const title = useTerminalStore((s) => s.title);
  const script = useTerminalStore((s) => s.script);
  const isSaving = useTerminalStore((s) => s.isSaving);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIdRef = useRef(currentScriptId);

  useEffect(() => {
    if (prevIdRef.current !== currentScriptId) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      terminalStoreActions("isSaving", false);
      prevIdRef.current = currentScriptId;
      return;
    }
    if (!currentScriptId) return;

    if (!timerRef.current) {
      terminalStoreActions("isSaving", true);
    }
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      saveScript(currentScriptId, title, script);
      flushEditBuffer(currentScriptId);
      setLastViewedScript(currentScriptId);
      terminalStoreActions("isSaving", false);
    }, AUTO_SAVE_DELAY);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentScriptId, title, script]);

  // Prevent closing the window while a save is pending
  useEffect(() => {
    if (!isSaving) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isSaving]);
}

/**
 * Immediately flush the current store state to localStorage.
 * Call before switching scripts so no edits are lost.
 */
export function flushAutoSave() {
  const currentScriptId = terminalStoreGet("currentScriptId");
  const title = terminalStoreGet("title");
  const script = terminalStoreGet("script");

  if (!currentScriptId) return;
  saveScript(currentScriptId, title, script);
  flushEditBuffer(currentScriptId);
  terminalStoreActions("isSaving", false);
}
