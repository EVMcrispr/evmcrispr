import type { HoverRef } from "@evmcrispr/core";
import { deriveTitle } from "@evmcrispr/space";
import { lazy, Suspense, useEffect } from "react";
import { ExecuteButton } from "../components/execution/ExecuteButton";
import Footer from "../components/layout/Footer";
import Header from "../components/layout/Header";
import NewScriptButton from "../components/scripts/NewScriptButton";
import ShareScriptButton from "../components/scripts/ShareScriptButton";
import { ScriptLoadState } from "../components/terminal/ScriptLoadState";
import {
  RevisionPreview,
  usePreviewedRevision,
} from "../editor/RevisionPreview";
import { ScriptView } from "../editor/ScriptView";
import { useViewMode } from "../hooks/useViewMode";
import { SidePanel } from "../panel/SidePanel";
import { SpacesList } from "../panel/space/SpacesList";
import { useMaybeSpace, useSpaceText } from "./SpaceContext";
import { StorageNotice } from "./StorageNotice";
import { setUi } from "./ui-store";
import type { SpaceRoute } from "./useSpaceRoute";

const ScriptEditor = lazy(() => import("../editor/ScriptEditor"));

function openDocs(ref: HoverRef) {
  setUi({ docsRequest: { ...ref, ts: Date.now() } });
}

/** The browser tab is named after the space on screen. */
export function useDocumentTitle() {
  const title = deriveTitle(useSpaceText(useMaybeSpace()));
  useEffect(() => {
    document.title = title
      ? `${title} - EVMcrispr Terminal`
      : "EVMcrispr Terminal";
  }, [title]);
}

export function DesktopLayout({ route }: { route: SpaceRoute }) {
  useDocumentTitle();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <StorageNotice />
      <div className="w-full shrink-0 bg-evm-gray-900 px-6 py-6">
        <Header />
      </div>

      <main className="flex min-h-0 flex-1 overflow-hidden bg-evm-gray-900 pl-2">
        {route.status === "ready" ? (
          <>
            <section className={SCRIPT_AREA}>
              <DesktopSpace />
            </section>
            <aside className={PANEL_AREA}>
              <SidePanel />
            </aside>
          </>
        ) : (
          <>
            <section className={SCRIPT_AREA}>
              <ScriptLoadState route={route} />
            </section>
            {/* The panel needs a space; the list of them stays reachable
                while one loads or could not be opened. */}
            <aside className={PANEL_AREA}>
              <SpacesList />
            </aside>
          </>
        )}
      </main>

      <div className="shrink-0 bg-evm-gray-900">
        <Footer />
      </div>
    </div>
  );
}

const SCRIPT_AREA = "flex basis-[70%] flex-col overflow-hidden bg-black pb-3";
const PANEL_AREA = "flex basis-[30%] flex-col overflow-hidden bg-evm-gray-900";

/** The script area of the space on screen: its toolbar, the script as an
 *  editor or a view, and the run button. */
function DesktopSpace() {
  const { viewMode, setViewMode } = useViewMode();
  const previewed = usePreviewedRevision();
  return (
    <>
      <div className="shrink-0 px-4 py-3">
        <div className="flex w-full justify-end">
          <div className="flex items-center gap-1">
            <NewScriptButton />
            <ShareScriptButton />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pt-2 animate-fade-in">
        {previewed ? (
          <RevisionPreview revision={previewed} onOpenDocs={openDocs} />
        ) : viewMode === "view" ? (
          <ScriptView
            onActivateEdit={() => setViewMode("edit")}
            onOpenDocs={openDocs}
          />
        ) : (
          <Suspense
            fallback={
              <div
                className="flex h-full items-center justify-center text-sm text-foreground/40"
                role="status"
              >
                Loading editor…
              </div>
            }
          >
            <ScriptEditor />
          </Suspense>
        )}
      </div>

      <div
        className="shrink-0 px-4 py-3 animate-fade-in"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="mt-3 flex w-full justify-end gap-3 pr-6 lg:pr-0">
          <ExecuteButton />
        </div>
      </div>
    </>
  );
}
