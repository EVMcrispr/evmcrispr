import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  terminalStoreActions,
  useTerminalStore,
} from "../stores/terminal-store";
import { useScriptFromId } from "./useStoredScript";
import { getScriptSavedInLocalStorage } from "../utils";

/**
 * Encapsulates all URL-param parsing, script-from-ID loading,
 * and navigation syncing for the terminal page.
 */
export function useTerminalScript() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const { title: titleFromId, script: scriptFromId } =
    useScriptFromId(params?.scriptId) || {};

  const { title: titleFromSession, script: scriptFromSession } =
    useTerminalStore();

  // Load script from URL-encoded query params (e.g. ?title=...&script=...)
  useEffect(() => {
    const encodedParams = new URLSearchParams(
      window.location.hash.split("?")[1],
    );
    const encodedTitle = encodedParams.get("title");
    const encodedScript = encodedParams.get("script");
    if (encodedTitle || encodedScript) {
      terminalStoreActions("title", encodedTitle ?? "");
      terminalStoreActions("script", encodedScript ?? "");
      terminalStoreActions("processScript");
    }
  }, []);

  // Sync title from script ID (IPFS or localStorage)
  useEffect(() => {
    if (titleFromId !== undefined) {
      terminalStoreActions("title", titleFromId);
    }
  }, [titleFromId]);

  // Sync script content from script ID
  useEffect(() => {
    if (scriptFromId !== undefined) {
      terminalStoreActions("script", scriptFromId);
      terminalStoreActions("processScript");
    }
  }, [scriptFromId]);

  // Navigate away from scriptId when the user edits the title or script
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (location.pathname !== "/") {
      const { title: _title, script: _script } =
        getScriptSavedInLocalStorage(params.scriptId) ?? {};
      if (titleFromSession !== _title || scriptFromSession !== _script) {
        navigate("/");
      }
    }
  }, [titleFromSession, scriptFromSession]);

  return { titleFromSession, scriptFromSession };
}
