import { ShareIcon } from "@heroicons/react/24/solid";
import { Button, IconButton, Tooltip, toast } from "@repo/ui";
import { useEffect, useState } from "react";

import pinJSON from "../../api/pinata/pin-json";
import { useScript, useSpace, useUnreviewed } from "../../app/SpaceContext";
import { useUi } from "../../app/ui-store";
import { askForReview, showReview } from "../../review/surface";
import { shareScript } from "../../space/links";

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
      const shared = await shareScript(space, text, {
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
    } catch (_e) {
      toast.error("The script could not be saved to IPFS");
      setLoading(false);
    }
  }

  const tooltipLabel = unreviewed
    ? "Review changes before sharing"
    : url
      ? "Link copied to clipboard!"
      : "Generate link";

  if (mobile) {
    // No hover tooltips on touch — a toast explains the title requirement.
    return (
      <IconButton
        type="button"
        aria-label="Share encrypted link"
        variant="outline"
        size="sm"
        className="min-h-9 min-w-9 shadow-none"
        disabled={!!url || isLoading}
        onClick={() => void handleShare()}
      >
        {isLoading ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <ShareIcon className="size-4" />
        )}
      </IconButton>
    );
  }

  if (showLabel) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-full justify-start gap-3 px-3 font-sans text-xs shadow-none"
        onClick={() => void handleShare()}
        disabled={!!url || isLoading}
      >
        <ShareIcon data-icon="inline-start" />
        {isLoading ? "Encrypting link…" : "Share encrypted link"}
      </Button>
    );
  }

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label="Share script"
          variant="ghost"
          onClick={handleShare}
          size="md"
          disabled={!!url || isLoading}
        >
          {isLoading ? (
            <span className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
          ) : (
            <ShareIcon className="w-5 h-5" />
          )}
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Content side="top">{tooltipLabel}</Tooltip.Content>
    </Tooltip>
  );
}
