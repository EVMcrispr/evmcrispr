import { encryptScript } from "@evmcrispr/core";
import { ShareIcon } from "@heroicons/react/24/solid";
import { IconButton, Tooltip, toast } from "@repo/ui";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import pinJSON from "../../api/pinata/pin-json";
import { useTerminalStore } from "../../stores/terminal-store";

type ShareButtonProps = {
  script: string;
  title: string;
};

export default function ShareButton({ script, title }: ShareButtonProps) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isLoading, setLoading] = useState(false);
  const viewMode = useTerminalStore((s) => s.viewMode);

  useEffect(() => {
    setUrl("");
  }, []);

  async function handleShare() {
    if (!globalThis.crypto?.subtle) {
      toast.error("Sharing requires a secure context (https)");
      return;
    }

    setLoading(true);
    try {
      // The pinned JSON is end-to-end encrypted; only the key carried in the
      // link's fragment can decrypt it, so IPFS/Pinata never see the script.
      const { envelope, key } = await encryptScript({ title, script });
      const { IpfsHash: hash } = await pinJSON(
        envelope,
        "EVMcrispr - encrypted script",
      );
      // Carry the sender's current view preference into the share link so
      // recipients open the same surface (viewer vs editor) the sharer
      // was looking at when they hit Share. Recipients can still toggle.
      // The key must stay the LAST segment: react-router's parsePath splits
      // the fragment on `#` before `?`, so `?mode` after the key would be
      // swallowed into the inner hash.
      const modeSuffix = viewMode === "view" ? "?mode=view" : "";
      const _url = `${window.location.origin}/#/${hash}${modeSuffix}#${key}`;
      setUrl(_url);
      navigator.clipboard.writeText(_url);
      toast.success("The link is copied to the clipboard");
      setLoading(false);
      navigate(`/${hash}${modeSuffix}#${key}`, { replace: true });
    } catch (_e) {
      toast.error("The script could not be saved to IPFS");
      setLoading(false);
    }
  }

  const tooltipLabel = title
    ? url
      ? "Link copied to clipboard!"
      : "Generate link"
    : "The script needs a title first";

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label="Share script"
          variant="ghost"
          onClick={handleShare}
          size="md"
          disabled={!!url || !title || isLoading}
        >
          {isLoading ? (
            <span className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
          ) : (
            <ShareIcon className="w-5 h-5" />
          )}
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Content variant={title ? "default" : "warning"} side="top">
        {tooltipLabel}
      </Tooltip.Content>
    </Tooltip>
  );
}
