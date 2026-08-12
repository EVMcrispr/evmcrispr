import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import { Button } from "@repo/ui";
import { useState } from "react";

import { loginWithNexus } from "../../../ai/nexus-auth";

export const NEXUS_URL =
  "https://nexus.dappnode.com/?utm_source=evmcrispr2026-07&utm_medium=referral";
export const RECHARGE_URL =
  "https://nexus.dappnode.com/billing?utm_source=evmcrispr2026-07&utm_medium=referral";

/** Website/docs site this build links to — same PUBLIC_SITE_URL the
 *  website build uses; the experimental deploy overrides it with
 *  next-docs. */
const SITE_URL: string =
  import.meta.env.PUBLIC_SITE_URL ?? "https://evmcrispr.com";

export function ChatSettings({
  onSave,
  onBack,
  onDisconnect,
  balanceCents,
  notice,
}: {
  onSave: (key: string) => void;
  onBack?: () => void;
  onDisconnect?: () => void;
  balanceCents?: number | null;
  /** Why the user was sent here, e.g. a key that stopped working mid-chat. */
  notice?: string;
}) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const login = async () => {
    setLoginError(null);
    setLoggingIn(true);
    try {
      onSave(await loginWithNexus());
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-5 overflow-y-auto">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground transition-colors self-start"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
      )}
      <h2 className="text-xl font-head text-foreground">Chat settings</h2>

      <section className="flex flex-col gap-3">
        <h3 className="mt-3 flex items-center gap-2 text-base font-head text-evm-green-300">
          <img src="/dappnode-logo.svg" alt="" className="w-5 h-5" />
          DappNode Nexus assistant
        </h3>
        <p className="text-sm text-foreground/70">
          Chat with a built-in assistant that can read, edit, validate and
          simulate the script in the editor — powered by your{" "}
          <a
            href={NEXUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-evm-green-300 hover:underline"
          >
            DappNode Nexus account
          </a>
          .
        </p>
        {onDisconnect ? (
          <>
            {balanceCents != null && (
              <p className="text-sm text-foreground/70">
                Balance: €{(balanceCents / 100).toFixed(2)}
              </p>
            )}
            <div className="flex gap-2">
              <Button asChild size="sm">
                <a
                  href={RECHARGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Recharge
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            {notice && <p className="text-sm text-red-400">{notice}</p>}
            <p className="text-sm text-foreground/70">
              New to DappNode Nexus? Sign up through the login and you get 5€ in
              free AI tokens.
            </p>
            <Button
              type="button"
              onClick={login}
              disabled={loggingIn}
              className="self-start"
            >
              {loggingIn ? "Waiting for login..." : "Login with Dappnode Nexus"}
            </Button>
            {loginError && <p className="text-sm text-red-400">{loginError}</p>}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="mt-3 flex items-center gap-2 text-base font-head text-evm-green-300">
          <img src="/mcp-logo.svg" alt="" className="w-5 h-5" />
          Use your own AI
        </h3>
        <p className="text-sm text-foreground/70">
          Already use ChatGPT, Claude, or Cursor? Point it at EVMcrispr's MCP
          server and it can write, validate and simulate scripts for you.
        </p>
        <Button asChild size="sm" className="self-start">
          <a
            href={`${SITE_URL}/guides/mcp/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the MCP guide
          </a>
        </Button>
      </section>
    </div>
  );
}
