import { useCallback, useState } from "react";

import type { StoredScript } from "../types/index";
import {
  getScriptList,
  getScriptSavedInLocalStorage,
  removeScriptFromLocalStorage,
  saveScriptToLocalStorage,
  slug,
} from "../utils";

/**
 * Reactive hook wrapping localStorage CRUD operations for scripts.
 */
export function useScriptPersistence() {
  const [scripts, setScripts] = useState<StoredScript[]>(getScriptList());
  const [filteredScripts, setFilteredScripts] =
    useState<StoredScript[]>(scripts);
  const [query, setQuery] = useState("");

  const refresh = useCallback(() => {
    const latest = getScriptList();
    setScripts(latest);
    setFilteredScripts(
      query
        ? latest.filter(({ title }) => slug(title).includes(slug(query)))
        : latest,
    );
  }, [query]);

  const filter = useCallback(
    (newQuery: string) => {
      const filtered = scripts.filter(({ title }) =>
        slug(title).includes(slug(newQuery)),
      );
      setQuery(newQuery);
      setFilteredScripts(filtered);
    },
    [scripts],
  );

  const save = useCallback((title: string, script: string) => {
    saveScriptToLocalStorage(title, script);
  }, []);

  const remove = useCallback(
    (title: string) => {
      removeScriptFromLocalStorage(title);
      const latest = getScriptList();
      setScripts(latest);
      setFilteredScripts(
        query
          ? latest.filter(({ title: t }) => slug(t).includes(slug(query)))
          : latest,
      );
    },
    [query],
  );

  const get = useCallback(
    (title?: string) => getScriptSavedInLocalStorage(title),
    [],
  );

  return {
    scripts,
    filteredScripts,
    query,
    save,
    remove,
    get,
    filter,
    refresh,
  };
}
