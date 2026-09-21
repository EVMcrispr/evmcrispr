import { useState } from "react";
import { useLocation } from "react-router";
import type { ScriptInputValue } from "../components/execution/ScriptIO";

/** Hash-route query takes precedence over the document query, including empty input. */
export function stdinFromUrl(
  routeSearch: string,
  documentSearch = "",
): string | undefined {
  return (
    new URLSearchParams(routeSearch).get("stdin") ??
    new URLSearchParams(documentSearch).get("stdin") ??
    undefined
  );
}

export function useScriptInput(scriptId: string | null) {
  const location = useLocation();
  const urlInput = stdinFromUrl(location.search, window.location.search);
  const [override, setOverride] = useState<{
    scriptId: string | null;
    urlInput: string | undefined;
    value: ScriptInputValue | undefined;
  }>();
  const input =
    override?.scriptId === scriptId && override?.urlInput === urlInput
      ? override.value
      : urlInput === undefined
        ? undefined
        : { name: "URL input", text: urlInput, source: "url" as const };
  return {
    input,
    setInput: (value: ScriptInputValue | undefined) =>
      setOverride({ scriptId, urlInput, value }),
  };
}
