import type { HoverRef } from "@evmcrispr/core";
import { useEffect, useRef, useState } from "react";
import { ScriptLoadState } from "../components/terminal/ScriptLoadState";
import {
  RevisionPreview,
  usePreviewedRevision,
} from "../editor/RevisionPreview";
import { useKeyboardInsets } from "../hooks/useKeyboardInsets";
import { MobileHeader } from "../mobile/MobileHeader";
import { MobileMenu } from "../mobile/MobileMenu";
import { ScriptContextBar } from "../mobile/ScriptContextBar";
import { ScriptSheet } from "../mobile/ScriptSheet";
import { AgentsTab } from "../panel/agents/AgentsTab";
import {
  ScriptLinkProvider,
  ToChatProvider,
} from "../panel/space/HeaderAction";
import { SpacesList } from "../panel/space/SpacesList";
import { SpaceTab } from "../panel/space/SpaceTab";
import { Review } from "../review/Review";
import { askForReview, useSurface } from "../review/surface";
import { useApproval, useReview } from "../review/useReview";
import { useLatestRun } from "../runs/useRun";
import { useWallet } from "../wallet/WalletContext";
import { useDocumentTitle } from "./DesktopLayout";
import { morph } from "./morph";
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
  const space = useSpace();
  const review = useReview();
  const run = useLatestRun();
  const previewed = usePreviewedRevision();
  const reviewOpen = useSurface().open;
  // The review also comes up by itself (Run was refused): only the
  // user asking for it, in `openReview`, puts changes and an Approve on
  // it.
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

  /** The space, as a phone shows it: its timeline. */
  const showTimeline = () => {
    setUi({ spaceView: "timeline" });
    setSurface("space");
  };
  /** A run is followed in its card, in the space's timeline. */
  const showRun = showTimeline;
  /** The script as it is now, not a revision that was being looked at. */
  const openCurrentScript = () => {
    setUi({ previewRevisionId: null });
    setSurface("script");
  };

  // The timeline comes up by itself when the run of this space needs the
  // user (it paused) or ends, not for a run found there on arriving.
  const status = run?.record.status ?? null;
  const followed = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of status
  useEffect(() => {
    const arrived = followed.current !== space.id;
    followed.current = space.id;
    if (arrived) return;
    if (status !== null && status !== "running") showRun();
  }, [space.id, status]);

  // The review opens on what the script is now. What it then does (check
  // it, or simulate it when it is approved) is the review's.
  const openReview = () => askForReview(space);

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
          simulation={review.simulation}
          resultUnseen={reviewReady && !reviewSeen}
          onOpenSpaces={() =>
            morph(() => {
              setUi({ spaceView: "list" });
              setSurface("space");
            })
          }
          onOpenSpace={() => morph(showTimeline)}
          onSimulate={openReview}
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
              simulation={review.simulation}
              onBack={() => morph(showTimeline)}
              onAsk={() => morph(() => setSurface("agents"))}
              onSimulate={openReview}
              onOpenDocs={openDocs}
            />
          ))}
        {surface === "space" && (
          <div className="min-h-0 flex-1">
            {/* The way back to the chat is in the header of whichever view
                of the tab is on screen, not in a row of its own. */}
            <ToChatProvider value={() => morph(() => setSurface("agents"))}>
              <ScriptLinkProvider value={() => morph(openCurrentScript)}>
                <SpaceTab />
              </ScriptLinkProvider>
            </ToChatProvider>
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

      {reviewOpen && (
        <Review sheet review={review} approval={approval} onRun={showRun} />
      )}
    </>
  );
}
