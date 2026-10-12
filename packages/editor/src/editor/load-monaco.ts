import { useEffect, useState } from "react";

interface Cancelable<T> extends Promise<T> {
  cancel(): void;
}

interface MonacoLoader<T> {
  init(): Cancelable<T>;
  __getMonacoInstance(): T | null;
}

/** Asks the loader for Monaco and hands it over when it arrives.
 *  Returns what stops waiting for it.
 *
 *  `@monaco-editor/loader` stops waiting by REJECTING the promise it
 *  gave, with `{ type: "cancelation" }`. That one is expected and
 *  dropped here; anything else is a real failure to load. */
export function loadMonaco<T>(
  loader: Pick<MonacoLoader<T>, "init">,
  onLoaded: (monaco: T) => void,
  onError: (error: unknown) => void,
): () => void {
  const loading = loader.init();
  loading.then(onLoaded, (error: unknown) => {
    if ((error as { type?: string } | null)?.type !== "cancelation")
      onError(error);
  });
  return () => loading.cancel();
}

/** Monaco, or null until it has loaded. Used in place of the
 *  `useMonaco` of @monaco-editor/react, which leaves the cancellation
 *  unhandled: unmounting before Monaco arrived (leaving edit mode
 *  early, or React's double mount in development) then raised an
 *  uncaught rejection. */
export function useLoadedMonaco<T>(loader: MonacoLoader<T>): T | null {
  const [monaco, setMonaco] = useState(() => loader.__getMonacoInstance());
  useEffect(() => {
    if (monaco) return;
    return loadMonaco(loader, setMonaco, (error) =>
      console.error("Monaco could not be loaded:", error),
    );
  }, [loader, monaco]);
  return monaco;
}
