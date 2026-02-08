import { EVMcrispr } from "@evmcrispr/core";
import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { useDebounce } from "./useDebounce";

export function useEditorState(script: string) {
  const debouncedScript = useDebounce(script, 300);
  const client = usePublicClient();
  const evm = useMemo(() => new EVMcrispr(client), [client]);

  const [keywords, setKeywords] = useState<{
    commands: string[];
    helpers: string[];
  }>({ commands: [], helpers: [] });

  useEffect(() => {
    evm.getKeywords(debouncedScript).then(setKeywords);
  }, [evm, debouncedScript]);

  return {
    evm,
    commandKeywords: keywords.commands,
    helperKeywords: keywords.helpers,
  };
}
