import { cid } from "is-ipfs";
import { useEffect, useState } from "react";

import fetchPin from "../api/pinata/fetch-pin";
import type { BareScript } from "../types/index";
import { getScript } from "../utils";

export function isCID(s: string | undefined): s is string {
  return !!s && !!cid(s);
}

export type ScriptResult =
  | { status: "loading" }
  | { status: "found"; data: BareScript & { id?: string } }
  | { status: "not-found" }
  | { status: "error"; error: string };

/**
 * Resolve a scriptId param to script content.
 * - UUID  -> look up in the new registry
 * - CID   -> fetch from IPFS
 * Returns undefined when no scriptId is provided, otherwise a ScriptResult
 * with a discriminated status.
 */
export function useScriptFromId(
  scriptId: string | undefined,
): ScriptResult | undefined {
  const [result, setResult] = useState<ScriptResult | undefined>();

  useEffect(() => {
    if (!scriptId) {
      setResult(undefined);
      return;
    }

    if (isCID(scriptId)) {
      setResult({ status: "loading" });
      (async () => {
        try {
          const data = await fetchPin(
            "https://ipfs.blossom.software",
            scriptId,
          );
          if (data) {
            setResult({ status: "found", data });
          } else {
            setResult({ status: "error", error: "Empty response from IPFS" });
          }
        } catch (e) {
          setResult({
            status: "error",
            error: e instanceof Error ? e.message : "IPFS fetch failed",
          });
        }
      })();
      return;
    }

    const stored = getScript(scriptId);
    if (stored) {
      setResult({
        status: "found",
        data: { id: stored.id, title: stored.title, script: stored.script },
      });
    } else {
      setResult({ status: "not-found" });
    }
  }, [scriptId]);

  return result;
}
