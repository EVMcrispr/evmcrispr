import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import pinJSON from "../api/pinata/pin-json";

/**
 * Encapsulates the Pinata IPFS sharing logic:
 * pin script data, generate URL, copy to clipboard, and navigate.
 */
export function useScriptShare(script: string) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isLoading, setLoading] = useState(false);

  // Reset the URL whenever the script changes
  useEffect(() => {
    setUrl("");
  }, [script]);

  const share = useCallback(
    async (title: string) => {
      const data = { title, script };

      setLoading(true);
      try {
        const { IpfsHash: hash } = await pinJSON(data);
        const _url = `${window.location.origin}/#/${hash}`;
        setUrl(_url);
        navigator.clipboard.writeText(_url);
        toast.success("The link is copied to the clipboard");
        setLoading(false);
        navigate(`/${hash}`, { replace: true });
      } catch (e) {
        toast.error("The script could not be saved to IPFS");
        setLoading(false);
      }
    },
    [script, navigate],
  );

  const resetUrl = useCallback(() => {
    setUrl("");
  }, []);

  return {
    share,
    url,
    isLoading,
    resetUrl,
  };
}
