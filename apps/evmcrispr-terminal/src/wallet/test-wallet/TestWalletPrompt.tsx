import { useSyncExternalStore } from "react";
import { SigningPanel } from "./SigningPanel";
import type { TerminalTestWallet } from "./wallet";

/** The test wallet's prompt for the request at the head of its queue. */
export function TestWalletPrompt({ test }: { test: TerminalTestWallet }) {
  const request = useSyncExternalStore(
    test.queue.subscribe,
    test.queue.current,
  );
  return (
    <SigningPanel
      request={request}
      onApprove={() => request && test.queue.answer(request, true)}
      onReject={() => request && test.queue.answer(request, false)}
    />
  );
}
