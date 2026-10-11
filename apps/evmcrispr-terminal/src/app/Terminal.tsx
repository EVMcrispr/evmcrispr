import { toast } from "@repo/ui";
import { useEffect } from "react";
import { ScrollRestoration, useNavigate } from "react-router";
import SelectWalletModal from "../components/wallet/SelectWalletModal";
import { useSmallScreen } from "../hooks/useSmallScreen";
import { closeReview } from "../review/surface";
import { useWallet } from "../wallet/WalletContext";
import { useApp } from "./AppContext";
import { DesktopLayout } from "./DesktopLayout";
import { MobileLayout } from "./MobileLayout";
import { stopLookingAtRemoved } from "./removed";
import { SpaceProvider } from "./SpaceContext";
import { setUi } from "./ui-store";
import { useSpaceRoute } from "./useSpaceRoute";

/** The one route: turns the address into the space on screen and shows it
 *  in the layout that fits the window. */
export default function Terminal() {
  const app = useApp();
  const route = useSpaceRoute();
  const small = useSmallScreen();
  const wallet = useWallet();
  const navigate = useNavigate();

  // The space on screen was removed in another tab (removing it here
  // goes elsewhere first): say so, and show what is left.
  useEffect(() => {
    if (route.status !== "removed") return;
    toast("This space was removed");
    const [next] = app.spaces.index.getState();
    setUi({ spaceView: "list" });
    navigate(next ? `/${next.id}` : "/", { replace: true });
  }, [route.status, navigate, app]);

  // A revision is viewed, and a review is held, in its own space only.
  const spaceId = route.status === "ready" ? route.space.id : null;
  useEffect(() => {
    void spaceId;
    setUi({ previewRevisionId: null });
    closeReview();
  }, [spaceId]);

  const space = route.status === "ready" ? route.space : null;
  useEffect(() => (space ? stopLookingAtRemoved(space) : undefined), [space]);

  const Layout = small ? MobileLayout : DesktopLayout;

  return (
    <>
      <ScrollRestoration />
      <SpaceProvider value={route.status === "ready" ? route.space : null}>
        <Layout route={route} />
      </SpaceProvider>
      {/* Desktop connects through Header's own modal; this one only serves
          the mobile flow (wallet.connectWallet). */}
      {small && (
        <SelectWalletModal
          isOpen={wallet.isWalletModalOpen}
          onClose={wallet.closeWalletModal}
          mobile
        />
      )}
    </>
  );
}
