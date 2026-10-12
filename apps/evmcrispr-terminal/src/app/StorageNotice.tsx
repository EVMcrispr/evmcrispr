import { Button, Notice } from "@repo/ui";
import { useStore } from "zustand";
import { useApp } from "./AppContext";

/** The two things storage can tell the user: that it is not there, and
 *  that a newer version of the app needs this tab reloaded. */
export function StorageNotice() {
  const { storage, outdated } = useApp();
  const isOutdated = useStore(outdated);

  if (isOutdated)
    return (
      <Notice
        tone="warning"
        layout="strip"
        urgent
        action={
          <Button
            variant="quiet"
            size="row"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        }
      >
        A newer version of EVMcrispr is open in another tab.
      </Notice>
    );
  if (!storage.persistent)
    return (
      <Notice tone="warning" layout="strip" live>
        This browser is not letting EVMcrispr store anything. Nothing will be
        saved when you close this tab.
      </Notice>
    );
  return null;
}
