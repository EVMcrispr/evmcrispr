import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { useLibraryStore } from "../stores/library-store";
import {
  SCRIPT_PLACEHOLDER,
  terminalStoreActions,
} from "../stores/terminal-store";
import {
  createScript,
  getAllScripts,
  getLastViewedScript,
  getScript,
  setLastViewedScript,
} from "../utils";
import { migrateFromLegacyStorage } from "../utils/migration";
import { isCID, useScriptFromId } from "./useStoredScript";

function loadIntoStore(id: string, title: string, script: string) {
  terminalStoreActions("currentScriptId", id);
  terminalStoreActions("title", title);
  terminalStoreActions("script", script);
  setLastViewedScript(id);
}

/**
 * Encapsulates all URL-param parsing, script-from-ID loading,
 * and last-viewed restoration for the terminal page.
 */
export function useTerminalScript(): {
  scriptNotFound: boolean;
  ipfsError: boolean;
  ipfsLoading: boolean;
} {
  const params = useParams();
  const navigate = useNavigate();
  const initialized = useRef(false);

  const result = useScriptFromId(params?.scriptId);

  const scriptNotFound = result?.status === "not-found";
  const ipfsError = result?.status === "error";
  const ipfsLoading = result?.status === "loading";

  const found = result?.status === "found" ? result.data : undefined;
  const titleFromId = found?.title;
  const scriptFromId = found?.script;
  const idFromUrl = found?.id;

  // One-time init: migration + load last viewed script (when no URL param)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    migrateFromLegacyStorage();

    useLibraryStore.getState().hydrateFromRegistry(
      getAllScripts().map(({ id, title, createdAt, updatedAt }) => ({
        id,
        title,
        createdAt,
        updatedAt,
      })),
    );

    // URL has a scriptId -- handled by the useScriptFromId effects below
    if (params?.scriptId) return;

    // Check for hash query params (e.g. Safe app: ?title=...&script=...)
    const encodedParams = new URLSearchParams(
      window.location.hash.split("?")[1],
    );
    const encodedTitle = encodedParams.get("title");
    const encodedScript = encodedParams.get("script");
    if (encodedTitle || encodedScript) {
      const id = createScript(encodedTitle ?? "", encodedScript ?? "");
      loadIntoStore(id, encodedTitle ?? "", encodedScript ?? "");
      navigate(`/${id}`, { replace: true });
      return;
    }

    // Restore last viewed script
    const lastId = getLastViewedScript();
    if (lastId) {
      const stored = getScript(lastId);
      if (stored) {
        loadIntoStore(stored.id, stored.title, stored.script);
        navigate(`/${stored.id}`, { replace: true });
        return;
      }
    }

    // No URL, no query params, no last viewed script -- first visit
    const id = createScript("", SCRIPT_PLACEHOLDER);
    loadIntoStore(id, "", SCRIPT_PLACEHOLDER);
    navigate(`/${id}`, { replace: true });
  }, [params?.scriptId, navigate]);

  // Sync from URL-loaded script (UUID or IPFS)
  useEffect(() => {
    if (!params?.scriptId) return;
    if (!found) return;

    if (idFromUrl) {
      terminalStoreActions("currentScriptId", idFromUrl);
      setLastViewedScript(idFromUrl);
    } else if (!isCID(params.scriptId)) {
      return;
    } else {
      const id = createScript(titleFromId ?? "", scriptFromId ?? "");
      terminalStoreActions("currentScriptId", id);
      setLastViewedScript(id);
      navigate(`/${id}`, { replace: true });
    }

    if (titleFromId !== undefined) {
      terminalStoreActions("title", titleFromId);
    }
    if (scriptFromId !== undefined) {
      terminalStoreActions("script", scriptFromId);
    }
  }, [found, titleFromId, scriptFromId, idFromUrl, params?.scriptId, navigate]);

  return { scriptNotFound, ipfsError, ipfsLoading };
}
