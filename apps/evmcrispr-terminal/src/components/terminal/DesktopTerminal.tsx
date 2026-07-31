import type { HoverRef } from "@evmcrispr/core";
import { Viewer } from "@evmcrispr/editor";
import { lazy, Suspense } from "react";
import type { ViewMode } from "../../stores/terminal-store";
import { terminalStoreActions } from "../../stores/terminal-store";
import TitleInput from "../editor/TitleInput";
import ActionButtons from "../execution/ActionButtons";
import Footer from "../layout/Footer";
import Header from "../layout/Header";
import { SidePanel } from "../panel/SidePanel";
import NewScriptButton from "../scripts/NewScriptButton";
import ShareScriptButton from "../scripts/ShareScriptButton";
import {
  hasScriptLoadState,
  ScriptLoadState,
  type ScriptLoadStateProps,
} from "./ScriptLoadState";

const TerminalEditor = lazy(() => import("../editor/TerminalEditor"));

type DesktopTerminalProps = ScriptLoadStateProps & {
  address: `0x${string}` | undefined;
  title: string;
  script: string;
  viewMode: ViewMode;
  executingLine: number | null;
  logs: string[];
  errors: string[];
  onActivateEdit: () => void;
  onExecute: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
};

function handleOpenDocs(ref: HoverRef) {
  terminalStoreActions("docsRequest", { ...ref, ts: Date.now() });
}

export function DesktopTerminal(props: DesktopTerminalProps) {
  const loading = hasScriptLoadState(props);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="w-full shrink-0 bg-evm-gray-900 px-6 py-6">
        <Header address={props.address} onDisconnect={props.onDisconnect} />
      </div>

      <main className="flex min-h-0 flex-1 overflow-hidden bg-evm-gray-900 pl-2">
        <section className="flex basis-[70%] flex-col overflow-hidden bg-black pb-3">
          {loading ? (
            <ScriptLoadState {...props} />
          ) : (
            <>
              <div className="shrink-0 px-4 py-3">
                <div className="flex w-full">
                  <TitleInput />
                  <div className="flex-1" />
                  <div className="flex items-center gap-1">
                    <NewScriptButton />
                    <ShareScriptButton
                      title={props.title}
                      script={props.script}
                    />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-4 pt-2 animate-fade-in">
                {props.viewMode === "view" ? (
                  <Viewer
                    script={props.script}
                    executingLine={props.executingLine}
                    onActivateEdit={props.onActivateEdit}
                    onOpenDocs={handleOpenDocs}
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
                    <TerminalEditor />
                  </Suspense>
                )}
              </div>

              <div
                className="shrink-0 px-4 py-3 animate-fade-in"
                style={{ animationDelay: "0.1s" }}
              >
                <ActionButtons
                  onExecute={props.onExecute}
                  onCancel={props.onCancel}
                />
              </div>
            </>
          )}
        </section>

        <div className="h-full w-px bg-border" />

        <aside className="flex basis-[30%] flex-col overflow-hidden bg-evm-gray-900">
          <SidePanel logs={props.logs} errors={props.errors} />
        </aside>
      </main>

      <div className="shrink-0 bg-evm-gray-900">
        <Footer />
      </div>
    </div>
  );
}
