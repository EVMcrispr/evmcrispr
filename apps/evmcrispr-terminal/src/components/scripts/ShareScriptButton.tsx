import { ErrorTooLargeToPin } from "@evmcrispr/core";
import { head } from "@evmcrispr/space";
import { IconButton, Row, Spinner, toast } from "@repo/ui";
import { Share2 } from "@repo/ui/icons";
import { useEffect, useState } from "react";

import pinJSON from "../../api/pinata/pin-json";
import { useScript, useSpace, useUnreviewed } from "../../app/SpaceContext";
import { useUi } from "../../app/ui-store";
import { askForReview, showReview } from "../../review/surface";
import { shareRevision } from "../../space/links";

type ShareButtonProps = {
  showLabel?: boolean;
  mobile?: boolean;
  onShared?: () => void;
};

export default function ShareButton({
  showLabel = false,
  mobile = false,
  onShared,
}: ShareButtonProps) {
  const space = useSpace();
  const { text } = useScript();
  // Only a reviewed script is shared: until then the button leads to the
  // review. Whether a text may be shared is decided in `shareScript`.
  const unreviewed = useUnreviewed();
  const [url, setUrl] = useState("");
  const [isLoading, setLoading] = useState(false);
  const viewMode = useUi((s) => s.viewMode);

  // A link is for one text: a changed script can be shared again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger
  useEffect(() => {
    setUrl("");
  }, [text]);

  async function handleShare() {
    if (unreviewed) return askForReview(space);
    if (!globalThis.crypto?.subtle) {
      toast.error("Sharing requires a secure context (https)");
      return;
    }

    setLoading(true);
    try {
      // The script as it is, as a revision: the link is remembered on it,
      // and sharing the same text again hands back the same link.
      const revision = space.record("user") ?? head(space.timeline.getState());
      if (revision?.text !== text) throw new Error("no revision to share");
      const shared = await shareRevision(space, revision.id, {
        pin: pinJSON,
        origin: window.location.origin,
        viewMode,
      });
      if (!shared.ok) {
        setLoading(false);
        // Refused after a wait: the review comes up, asked for nothing.
        return showReview();
      }
      setUrl(shared.url);
      navigator.clipboard.writeText(shared.url);
      toast.success("The link is copied to the clipboard");
      setLoading(false);
      onShared?.();
    } catch (e) {
      toast.error(
        e instanceof ErrorTooLargeToPin
          ? "The script is too large to share (256 KB at most)"
          : "The script could not be saved to IPFS",
      );
      setLoading(false);
    }
  }

  const tooltipLabel = unreviewed
    ? "Review changes before sharing"
    : url
      ? "Link copied to clipboard!"
      : "Generate link";

  if (showLabel)
    return (
      <Row
        leading={<Share2 aria-hidden />}
        title={isLoading ? "Encrypting link…" : "Share encrypted link"}
        disabled={!!url || isLoading}
        onClick={() => void handleShare()}
      />
    );

  // In the header of the space's timeline.
  return (
    <IconButton
      aria-label={mobile ? "Share encrypted link" : "Share script"}
      tooltip={mobile ? false : tooltipLabel}
      variant="quiet"
      size="sm"
      onClick={handleShare}
      disabled={!!url || isLoading}
    >
      {isLoading ? <Spinner label="Encrypting link" /> : <Share2 aria-hidden />}
    </IconButton>
  );
}
