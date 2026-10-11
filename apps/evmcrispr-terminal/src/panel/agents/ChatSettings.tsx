import { loginWithNexus } from "@evmcrispr/ai";
import { BackButton, Button, Notice } from "@repo/ui";
import { useState } from "react";

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
  notice,
  balanceCents,
}: {
  onSave: (key: string) => void;
  onBack?: () => void;
  onDisconnect?: () => void;
  /** Why the user was sent here (e.g. the key stopped working mid-run).
   *  Shown above the login/recharge controls that answer it. */
  notice?: string | null;
  balanceCents?: number | null;
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
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      {onBack && (
        <div>
          <BackButton label="chat" onClick={onBack} />
        </div>
      )}
      <h2 className="m-0 font-head text-display font-bold text-fg">
        Chat settings
      </h2>

      <section className="flex flex-col gap-3">
        <h3 className="m-0 mt-3 flex items-center gap-2 font-head text-title font-bold text-primary">
          <img src="/dappnode-logo.svg" alt="" className="size-5" />
          DappNode Nexus assistant
        </h3>
        <p className="m-0 font-sans text-body text-fg-muted">
          Chat with a built-in assistant that can read, edit, validate and
          simulate the script in the editor — powered by your{" "}
          <a
            href={NEXUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            DappNode Nexus account
          </a>
          .
        </p>
        {notice && <Notice tone="danger">{notice}</Notice>}
        {onDisconnect ? (
          <>
            {balanceCents != null && (
              <p className="m-0 font-sans text-body text-fg-muted">
                Balance: €{(balanceCents / 100).toFixed(2)}
              </p>
            )}
            <div className="flex gap-3">
              <Button asChild variant="primary" size="sm">
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
                variant="neutral"
                size="sm"
                onClick={onDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="m-0 font-sans text-body text-fg-muted">
              New to DappNode Nexus? Sign up through the login and you get 5€ in
              free AI tokens.
            </p>
            <div className="flex">
              <Button
                type="button"
                variant="primary"
                onClick={login}
                loading={loggingIn}
              >
                {loggingIn
                  ? "Waiting for login..."
                  : "Login with Dappnode Nexus"}
              </Button>
            </div>
            {loginError && (
              <Notice tone="danger" layout="inline">
                {loginError}
              </Notice>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="m-0 mt-3 flex items-center gap-2 font-head text-title font-bold text-primary">
          <img src="/mcp-logo.svg" alt="" className="size-5" />
          Use your own AI
        </h3>
        <p className="m-0 font-sans text-body text-fg-muted">
          Already use ChatGPT, Claude, or Cursor? Point it at EVMcrispr's MCP
          server and it can write, validate and simulate scripts for you.
        </p>
        <div className="flex">
          <Button asChild variant="neutral" size="sm">
            <a
              href={`${SITE_URL}/guides/mcp/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the MCP guide
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
