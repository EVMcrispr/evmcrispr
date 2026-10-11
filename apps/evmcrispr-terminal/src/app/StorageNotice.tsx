import { useStore } from "zustand";
import { useApp } from "./AppContext";

/** The two things storage can tell the user: that it is not there, and
 *  that a newer version of the app needs this tab reloaded. */
export function StorageNotice() {
  const { storage, outdated } = useApp();
  const isOutdated = useStore(outdated);

  if (isOutdated)
    return (
      <div
        role="alert"
        className="flex shrink-0 items-center justify-center gap-3 bg-evm-yellow-300 px-4 py-1.5 font-sans text-xs text-evm-gray-900"
      >
        A newer version of EVMcrispr is open in another tab.
        <button
          type="button"
          className="underline"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  if (!storage.persistent)
    return (
      <div
        role="status"
        className="shrink-0 bg-evm-pink-300 px-4 py-1.5 text-center font-sans text-xs text-evm-gray-900"
      >
        This browser is not letting EVMcrispr store anything. Nothing will be
        saved when you close this tab.
      </div>
    );
  return null;
}
