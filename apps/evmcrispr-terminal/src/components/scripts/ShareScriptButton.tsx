import { ShareIcon } from "@heroicons/react/24/solid";
import { IconButton, Tooltip } from "@repo/ui";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import pinJSON from "../../api/pinata/pin-json";

type ShareButtonProps = {
  script: string;
  title: string;
};

export default function ShareButton({ script, title }: ShareButtonProps) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isLoading, setLoading] = useState(false);

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
      const _url = `${window.location.origin}/#/${hash}`;
      setUrl(_url);
      navigator.clipboard.writeText(_url);
      toast.success("The link is copied to the clipboard");
      setLoading(false);
      navigate(`/${hash}`, { replace: true });
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
          variant="outline"
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
