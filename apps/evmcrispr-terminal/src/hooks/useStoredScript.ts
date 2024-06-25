import { cid } from "is-ipfs";
import { useEffect, useState } from "react";

import fetchPin from "../api/pinata/fetch-pin";
import type { BareScript } from "../types";
import { getScriptSavedInLocalStorage } from "../utils";

function isCID(s: string | undefined) {
  return s && !!cid(s);
}

export function useScriptFromId(
  scriptId: string | undefined,
): BareScript | undefined {
  const [script, setScript] = useState<BareScript>();

  useEffect(() => {
    (async () => {
      if (!isCID(scriptId)) {
        setScript(getScriptSavedInLocalStorage(scriptId));
      } else {
        setScript(await fetchPin("https://ipfs.blossom.software", scriptId));
      }
    })();
  }, [scriptId]);
  return script;
}
