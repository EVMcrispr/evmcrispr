import { decryptScript, isEncryptedEnvelope } from "@evmcrispr/core";
import { cid } from "is-ipfs";
import { useEffect, useState } from "react";

import fetchPin from "../api/pinata/fetch-pin";
import type { BareScript } from "../types/index";
import { getScript } from "../utils";

export function isCID(s: string | undefined): s is string {
  return !!s && !!cid(s);
}

export type EncryptedReason = "missing-key" | "invalid-key" | "needs-upgrade";

export type ScriptResult =
  | { status: "loading" }
  | { status: "found"; data: BareScript & { id?: string } }
  | { status: "not-found" }
  | { status: "error"; error: string }
  | { status: "encrypted"; reason: EncryptedReason };

function isBareScript(x: unknown): x is BareScript {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as BareScript).title === "string" &&
    typeof (x as BareScript).script === "string"
  );
}

/**
 * Resolve a scriptId param to script content.
 * - UUID  -> look up in the new registry
 * - CID   -> fetch from IPFS; encrypted pins (evmcrispr >= 0.11.0) are
 *            decrypted with the key carried in the link's URL fragment
 * Returns undefined when no scriptId is provided, otherwise a ScriptResult
 * with a discriminated status.
 */
export function useScriptFromId(
  scriptId: string | undefined,
  decryptionKey?: string,
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
          if (isEncryptedEnvelope(data)) {
            if (!decryptionKey) {
              setResult({ status: "encrypted", reason: "missing-key" });
              return;
            }
            try {
              const decrypted = await decryptScript(data, decryptionKey);
              setResult({ status: "found", data: decrypted });
            } catch (e) {
              const needsUpgrade =
                e instanceof Error && e.message.includes("newer version");
              setResult({
                status: "encrypted",
                reason: needsUpgrade ? "needs-upgrade" : "invalid-key",
              });
            }
          } else if (isBareScript(data)) {
            setResult({ status: "found", data });
          } else if (data) {
            setResult({ status: "error", error: "Unrecognized pin content" });
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
  }, [scriptId, decryptionKey]);

  return result;
}
