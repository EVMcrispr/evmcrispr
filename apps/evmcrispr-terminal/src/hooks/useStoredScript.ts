import {
  decryptScript,
  isEncryptedEnvelope,
  unsupportedMinVersion,
} from "@evmcrispr/core";
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
  | { status: "encrypted"; reason: EncryptedReason; requiredVersion?: string };

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
 * - CID   -> fetch from IPFS; JSON share envelopes (bare {title, script} or
 *            encrypted, decrypted with the key carried in the link's URL
 *            fragment) or plain-text pins (loaded with an empty title)
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
          const text = await fetchPin(
            "https://ipfs.blossom.software",
            scriptId,
          );
          if (!text) {
            setResult({ status: "error", error: "Empty response from IPFS" });
            return;
          }
          // Pins are either JSON share envelopes (encrypted or bare
          // {title, script}) or plain-text scripts/modules.
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            data = undefined;
          }
          if (data === null || typeof data !== "object") {
            setResult({
              status: "found",
              data: { title: "", script: text },
            });
            return;
          }
          // A pin from a future share format (any shape) — check before the
          // shape branches so it's reported even without a key or when the
          // future envelope isn't recognizable at all.
          const requiredVersion = unsupportedMinVersion(data);
          if (requiredVersion) {
            setResult({
              status: "encrypted",
              reason: "needs-upgrade",
              requiredVersion,
            });
          } else if (isEncryptedEnvelope(data)) {
            if (!decryptionKey) {
              setResult({ status: "encrypted", reason: "missing-key" });
              return;
            }
            try {
              const decrypted = await decryptScript(data, decryptionKey);
              setResult({ status: "found", data: decrypted });
            } catch {
              setResult({ status: "encrypted", reason: "invalid-key" });
            }
          } else if (isBareScript(data)) {
            setResult({ status: "found", data });
          } else {
            setResult({ status: "error", error: "Unrecognized pin content" });
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
