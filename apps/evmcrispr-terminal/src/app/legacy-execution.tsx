import { createContext, type ReactNode, useContext } from "react";
import { useScriptInput } from "../hooks/useScriptInput";
import { useSmallScreen } from "../hooks/useSmallScreen";
import { useTransactionExecutor } from "../hooks/useTransactionExecutor";
import { useTransactionReview } from "../hooks/useTransactionReview";
import { useWallet } from "../wallet/WalletContext";
import { useMaybeSpace, useSpaceText } from "./SpaceContext";

interface Legacy {
  execution: ReturnType<typeof useTransactionExecutor>;
  review: ReturnType<typeof useTransactionReview>;
  input: ReturnType<typeof useScriptInput>["input"];
  setInput: ReturnType<typeof useScriptInput>["setInput"];
}

const LegacyContext = createContext<Legacy | null>(null);

/**
 * The run and the review of the space on screen, as the hooks from before
 * spaces provide them, shared without passing props. It sits above the
 * layouts and stays mounted whatever the address resolves to and whichever
 * layout fits the window, so a run in flight always has a view that can
 * cancel it; with no space on screen there is nothing to run. Stage 2
 * replaces the executor with the run manager and stage 4 the review; this
 * file goes with the second of them.
 */
export function LegacyExecution({
  intent,
  children,
}: {
  intent: "author" | "recipient";
  children: ReactNode;
}) {
  const space = useMaybeSpace();
  const text = useSpaceText(space);
  const wallet = useWallet();
  const small = useSmallScreen();
  const { input, setInput } = useScriptInput(space?.id ?? null);
  const execution = useTransactionExecutor(
    wallet.address,
    space,
    wallet.safeConnectorInstance,
    { openConsoleOnExecute: !small, stdin: input?.text },
  );
  // Share-link recipients land on a read-only script view: validate for
  // them automatically so the review status means something without a tap.
  const review = useTransactionReview(text, wallet.address, {
    stdin: input?.text,
    autoValidate: small && intent === "recipient" && !!space,
  });
  return (
    <LegacyContext.Provider value={{ execution, review, input, setInput }}>
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
