import { Button, Input } from "@repo/ui";
import { useState } from "react";

import { useTerminalStore } from "../../stores/terminal-store";

export default function SafeConnect({ onConnect }: { onConnect: () => void }) {
  const [safeAddress, setSafeAddress] = useState("");
  const [attemptedConnect, setAttemptedConnect] = useState(false);
  const [chain, address] = safeAddress.split(":");
  const isValidSafeAddress =
    /\w+/g.test(chain) &&
    ((address?.startsWith("0x") && address?.length === 42) ||
      address?.endsWith(".eth"));
  const error =
    attemptedConnect && !isValidSafeAddress
      ? "Invalid Safe address. Example: 'gno:0x1234...5678' or 'eth:my-account.eth'"
      : null;

  const { title, script } = useTerminalStore();

  const url =
    `https://app.safe.global/apps/open?safe=${safeAddress}&appUrl=` +
    encodeURIComponent(
      `https://evmcrispr.com/#/terminal?title=${encodeURIComponent(title)}&script=${encodeURIComponent(script)}`,
    );
  return (
    <>
      <Input
        autoFocus
        placeholder="Enter your Safe Address"
        value={safeAddress}
        onChange={(e) => {
          setSafeAddress(e.target.value);
          setAttemptedConnect(false);
        }}
        className="text-xl"
      />
      <div className="flex justify-center mt-4 mb-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            setAttemptedConnect(true);
            if (isValidSafeAddress) {
              window.open(url, "_blank");
              onConnect();
            }
          }}
        >
          Connect Safe
        </Button>
      </div>
      {error && (
        <p className="text-center text-evm-red-400 font-head">{error}</p>
      )}
    </>
  );
}
