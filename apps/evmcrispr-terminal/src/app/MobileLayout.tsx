import type { HoverRef } from "@evmcrispr/core";
import { consoleEntries } from "@evmcrispr/editor";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@repo/ui";
import { useEffect, useRef, useState } from "react";
import { ScriptIO } from "../components/execution/ScriptIO";
import { ScriptLoadState } from "../components/terminal/ScriptLoadState";
import {
  RevisionPreview,
  usePreviewedRevision,
} from "../editor/RevisionPreview";
import { useKeyboardInsets } from "../hooks/useKeyboardInsets";
import { useScriptInput } from "../hooks/useScriptInput";
import { MobileHeader } from "../mobile/MobileHeader";
import { MobileMenu } from "../mobile/MobileMenu";
import { type ExecutionPhase, ReviewSheet } from "../mobile/ReviewSheet";
import { ScriptContextBar } from "../mobile/ScriptContextBar";
import { ScriptSheet } from "../mobile/ScriptSheet";
import { AgentsTab } from "../panel/agents/AgentsTab";
import { HeldRun } from "../panel/space/HeldRun";
import { SpacesList } from "../panel/space/SpacesList";
import { SpaceTab } from "../panel/space/SpaceTab";
import {
  askForReview,
  closeReview,
  showReview,
  useSurface,
} from "../review/surface";
import { useApproval, useReview } from "../review/useReview";
import { followedBoxes } from "../runs/run-manager";
import { useActiveRun, useExecute, useLatestRun } from "../runs/useRun";
import { useWallet } from "../wallet/WalletContext";
import { useApp } from "./AppContext";
import { useDocumentTitle } from "./DesktopLayout";
import { useSpace } from "./SpaceContext";
import { StorageNotice } from "./StorageNotice";
import { setUi, useUi } from "./ui-store";
import type { SpaceRoute } from "./useSpaceRoute";

type Ready = Extract<SpaceRoute, { status: "ready" }>;
type MenuPage = "menu" | "reference";
/** The three surfaces, matching the panel's tabs on desktop. */
type Surface = "space" | "agents" | "script";

/** The mobile screen. The header and the workspace menu are there
 *  whatever the address resolves to; the rest needs a space. */
export function MobileLayout({ route }: { route: SpaceRoute }) {
  const wallet = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPage, setMenuPage] = useState<MenuPage>("menu");
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [surface, setSurface] = useState<Surface>("agents");
  useKeyboardInsets(true);
  useDocumentTitle();

  const openMenu = (page: MenuPage) => {
    setMenuPage(page);
    setMenuOpen(true);
  };

  return (
    <div className="mobile-terminal flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <StorageNotice />
      <MobileHeader
        address={wallet.address}
        onConnect={wallet.connectWallet}
        onOpenMenu={() => openMenu("menu")}
      />

      {route.status === "ready" ? (
        <MobileSpace
          route={route}
          surface={surface}
          setSurface={setSurface}
          chatSettingsOpen={chatSettingsOpen}
          onChatSettingsOpenChange={setChatSettingsOpen}
          onOpenReference={() => openMenu("reference")}
        />
      ) : (
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Without a space on screen the list of them stays reachable. */}
          {surface === "space" ? (
            <SpacesList />
          ) : (
            <ScriptLoadState route={route} />
          )}
        </main>
      )}

      <MobileMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) setMenuPage("menu");
        }}
        onOpenChatSettings={() => {
          setMenuOpen(false);
          setChatSettingsOpen(true);
        }}
        onOpenSpaces={() => {
          setMenuOpen(false);
          setUi({ spaceView: "list" });
          setSurface("space");
        }}
        initialPage={menuPage}
      />
    </div>
  );
}

/** Everything on the mobile screen that needs the space on screen. */
function MobileSpace({
  route,
  surface,
  setSurface,
  chatSettingsOpen,
  onChatSettingsOpenChange,
  onOpenReference,
}: {
  route: Ready;
  surface: Surface;
  setSurface: (surface: Surface | ((now: Surface) => Surface)) => void;
  chatSettingsOpen: boolean;
  onChatSettingsOpenChange: (open: boolean) => void;
  onOpenReference: () => void;
}) {
  const { runs } = useApp();
  const space = useSpace();
  const wallet = useWallet();
  const review = useReview();
  const { input, setInput } = useScriptInput(space.id);
  const execute = useExecute();
  const active = useActiveRun();
  const run = useLatestRun();
  const previewed = usePreviewedRevision();
  const reviewOpen = useSurface().open;
  // The sheet also comes up by itself (a run needs the user, or Execute
  // was refused): only the user asking for the review, in `openReview`,
  // puts changes and an Approve on it.
  const approval = useApproval();

  // Share-link recipients land on a read-only script: it is checked for
  // them, so its status means something without a tap.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per script arrived at
  useEffect(() => {
    if (route.intent === "recipient") void review.validate();
  }, [space.id, route.intent]);

  // Flag a ready review until the user has seen it. A review that finishes
  // with the sheet open counts as seen; one that goes stale resets the flag.
  const reviewReady = review.simulation.status === "ready";
  const [reviewSeen, setReviewSeen] = useState(false);
  useEffect(() => {
    if (!reviewReady) setReviewSeen(false);
    else if (reviewOpen) setReviewSeen(true);
  }, [reviewReady, reviewOpen]);

  // Re-pick the surface on every navigation: a share link lands on the
  // script, anything else on the chat. A space chosen from the list of
  // spaces stays on the Space surface, now showing its timeline.
  useEffect(() => {
    void space.id;
    setSurface((now) =>
      now === "space"
        ? now
        : route.intent === "recipient"
          ? "script"
          : "agents",
    );
  }, [space.id, route.intent, setSurface]);

  // The chat's settings live on the chat surface.
  useEffect(() => {
    if (chatSettingsOpen) setSurface("agents");
  }, [chatSettingsOpen, setSurface]);

  // A revision's row asked for its chat.
  const chatRequest = useUi((s) => s.chatRequest);
  useEffect(() => {
    if (chatRequest) setSurface("agents");
  }, [chatRequest, setSurface]);

  // A revision is viewed where the script is.
  const previewing = previewed !== null;
  useEffect(() => {
    if (previewing) setSurface("script");
  }, [previewing, setSurface]);

  // The run the sheet follows: its phase while the script runs, else how
  // it stands or ended.
  const phase: ExecutionPhase = !run
    ? "idle"
    : run.record.status === "running"
      ? (run.phase ?? "running")
      : run.record.status;
  // The sheet opens by itself when the run of this space needs the user
  // or ends, not for a run found there on arriving.
  const followed = useRef<string | null>(null);
  useEffect(() => {
    const arrived = followed.current !== space.id;
    followed.current = space.id;
    if (arrived) return;
    if (phase !== "idle" && phase !== "preparing" && phase !== "running")
      showReview();
  }, [space.id, phase]);

  const openReview = () => {
    askForReview(space);
    // A script the user approved is simulated for them. One they have not
    // reviewed is only checked: simulating runs it, so that waits for
    // their tap on the sheet.
    if (review.unreviewed) void review.validate();
    else if (review.simulation.status !== "ready") void review.simulate();
  };

  const openDocs = (ref: HoverRef) => {
    setUi({ docsRequest: { ...ref, ts: Date.now() } });
    onOpenReference();
  };

  return (
    <>
      {/* The script is the persistent subject of the session — keep its
          identity and state on screen while the user chats about it. */}
      {surface === "agents" && (
        <ScriptContextBar
          reviewState={review.simulation}
          reviewUnseen={reviewReady && !reviewSeen}
          onOpenScript={() => setSurface("script")}
          onOpenTimeline={() => {
            setUi({ spaceView: "timeline" });
            setSurface("space");
          }}
          onOpenReview={openReview}
        />
      )}

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {surface === "script" &&
          (previewed ? (
            <div className="min-h-0 flex-1 p-2">
              <RevisionPreview revision={previewed} onOpenDocs={openDocs} />
            </div>
          ) : (
            <ScriptSheet
              entryIntent={route.intent}
              sharedEncrypted={route.sharedEncrypted}
              reviewState={review.simulation}
              onBackToChat={() => setSurface("agents")}
              onReview={openReview}
              onOpenDocs={openDocs}
            />
          ))}
        {surface === "space" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-1 pt-1">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 gap-1 px-2 font-sans text-xs shadow-none"
                onClick={() => setSurface("agents")}
              >
                <ChevronLeftIcon data-icon="inline-start" />
                Back to chat
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <SpaceTab />
            </div>
          </div>
        )}
        {/* The chat owns the conversation state (useChatAgent) — keep it
            mounted across surface switches or the thread and any in-flight
            turn are lost. */}
        <div
          className={
            surface !== "agents" ? "hidden" : "flex min-h-0 flex-1 flex-col"
          }
        >
          <AgentsTab
            mobile
            onOpenScript={() => setSurface("script")}
            onOpenReview={openReview}
            onOpenTimeline={() => setSurface("space")}
            settingsOpen={chatSettingsOpen}
            onSettingsOpenChange={onChatSettingsOpenChange}
          />
        </div>
      </main>

      <ReviewSheet
        open={reviewOpen}
        onOpenChange={(open) => (open ? showReview() : closeReview())}
        review={review}
        approval={approval}
        chainName={wallet.chainName}
        address={wallet.address}
        executionPhase={phase}
        entries={run ? consoleEntries(run.record.console) : []}
        followingBoxes={run ? followedBoxes(run.record.console) : 0}
        ioControl={
          <ScriptIO
            key={space.id}
            input={input}
            disabled={active !== null}
            onChange={setInput}
            output={run?.record.output}
          />
        }
        errors={run?.record.errors ?? []}
        executed={run?.executed ?? []}
        onCancel={() => active && runs.cancel(active.record.id)}
        heldRun={active && <HeldRun run={active} />}
        onExecute={(shown) => void execute(shown)}
        onConnect={() => {
          closeReview();
          wallet.connectWallet();
        }}
      />
    </>
  );
}
