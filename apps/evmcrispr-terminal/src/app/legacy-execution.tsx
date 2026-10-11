import { createContext, type ReactNode, useCallback, useContext } from "react";
import { useScriptInput } from "../hooks/useScriptInput";
import { useSmallScreen } from "../hooks/useSmallScreen";
import { useTransactionReview } from "../hooks/useTransactionReview";
import { useWallet } from "../wallet/WalletContext";
import { useApp } from "./AppContext";
import { useMaybeSpace, useSpaceText } from "./SpaceContext";

interface Legacy {
  review: ReturnType<typeof useTransactionReview>;
}

const LegacyContext = createContext<Legacy | null>(null);

/**
 * The review of the space on screen, as the hook from before spaces
 * provides it, shared without passing props. Its simulation is a run like
 * any other: it is recorded in the space's timeline. Stage 4 replaces the
 * review, and this file goes with it.
 */
export function LegacyExecution({
  intent,
  children,
}: {
  intent: "author" | "recipient";
  children: ReactNode;
}) {
  const { runs } = useApp();
  const space = useMaybeSpace();
  const text = useSpaceText(space);
  const wallet = useWallet();
  const small = useSmallScreen();
  const { input } = useScriptInput(space?.id ?? null);
  const stdin = input?.text;
  const spaceId = space?.id;
  const simulate = useCallback(async () => {
    if (!spaceId) throw new Error("No space is open.");
    const started = await runs.start(spaceId, { mode: "simulated", stdin });
    if (!started.ok) throw new Error("This space is no longer here.");
    await started.ended;
    const run = runs.store.getState()[started.runId];
    if (!run.simulated)
      throw new Error(run.record.errors[0] ?? "The simulation failed.");
    return run.simulated;
  }, [runs, spaceId, stdin]);
  // Share-link recipients land on a read-only script view: validate for
  // them automatically so the review status means something without a tap.
  const review = useTransactionReview(text, wallet.address, {
    stdin,
    simulate,
    autoValidate: small && intent === "recipient" && !!space,
  });
  return (
    <LegacyContext.Provider value={{ review }}>
      {children}
    </LegacyContext.Provider>
  );
}

export function useLegacy(): Legacy {
  const legacy = useContext(LegacyContext);
  if (!legacy)
    throw new Error("useLegacy must be used inside <LegacyExecution>");
  return legacy;
}
