/**
 * Run a command under one anvil of its own: claim a port, start an anvil
 * there, export the port to the command (and so to every test process it
 * starts, turbo's included), then stop the anvil and release the port.
 *
 *   bun scripts/with-anvil.ts turbo run test:unit --continue
 *
 * A run's processes share its anvil; parallel runs, in this checkout or in
 * a worktree, never share one.
 */
import {
  claimAnvilPort,
  ensureAnvil,
  getEndpoint,
  loadEnv,
  resetAnvil,
} from "./anvil-config";

export async function runWithAnvilPort(
  argv: string[],
  { startAnvil = true }: { startAnvil?: boolean } = {},
): Promise<number> {
  const release = claimAnvilPort();
  let anvil: Awaited<ReturnType<typeof ensureAnvil>>;
  const cleanUp = () => {
    anvil?.kill();
    anvil = undefined;
    release?.();
  };
  const onSignal = (signal: NodeJS.Signals) => {
    cleanUp();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    if (startAnvil) {
      await loadEnv();
      anvil = await ensureAnvil();
      // A left-over anvil of a run that died on this port: start pristine.
      const endpoint = getEndpoint();
      if (release && !anvil && endpoint) await resetAnvil(endpoint);
    }
    const child = Bun.spawn(argv, {
      stdio: ["inherit", "inherit", "inherit"],
      env: process.env,
    });
    return await child.exited;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    cleanUp();
  }
}

if (import.meta.main) {
  process.exit(await runWithAnvilPort(process.argv.slice(2)));
}
