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
    const data = {
      title,
      script,
    };

    setLoading(true);
    try {
      const { IpfsHash: hash } = await pinJSON(data);
      // Carry the sender's current view preference into the share link so
      // recipients open the same surface (viewer vs editor) the sharer
      // was looking at when they hit Share. Recipients can still toggle.
      const modeSuffix = viewMode === "view" ? "?mode=view" : "";
      const _url = `${window.location.origin}/#/${hash}${modeSuffix}`;
      setUrl(_url);
      navigator.clipboard.writeText(_url);
      toast.success("The link is copied to the clipboard");
      setLoading(false);
      navigate(`/${hash}${modeSuffix}`, { replace: true });
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
