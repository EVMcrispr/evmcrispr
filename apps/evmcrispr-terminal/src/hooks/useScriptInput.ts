import { useLocation } from "react-router";
import { type ScriptInputValue, setUi, uiStore, useUi } from "../app/ui-store";

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

/** The stdin of a space's next run: what the user chose, else what the
 *  address carries. Kept in view state, so the stdin row and whatever
 *  starts a run read the same value. */
export function useScriptInput(spaceId: string | null) {
  const location = useLocation();
  const urlInput = stdinFromUrl(location.search, window.location.search);
  const override = useUi((s) => (spaceId ? s.stdin[spaceId] : undefined));
  const input: ScriptInputValue | undefined =
    override && override.urlInput === urlInput
      ? override.value
      : urlInput === undefined
        ? undefined
        : { name: "URL input", text: urlInput, source: "url" };
  return {
    input,
    setInput: (value: ScriptInputValue | undefined) => {
      if (!spaceId) return;
      setUi({
        stdin: { ...uiStore.getState().stdin, [spaceId]: { urlInput, value } },
      });
    },
  };
}
