import { evml } from "@evmcrispr/core";
import {
  type Address,
  createWalletClient,
  type Hex,
  http,
  isAddress,
  type LocalAccount,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getDefaultChainId, getRpcUrl } from "../lib/config";
import { makeConfirm } from "../lib/confirm";
import { followNotice } from "../lib/follow-notice";
import { confirmingAccount } from "../lib/local-signer";
import { localWallet } from "../lib/local-wallet";
import { registerAllModules } from "../lib/modules";
import { readScriptSource, readStdin } from "../lib/read-source";

const USAGE = `Usage: evmcrispr run <file|-> [--wallet-rpc URL --account ADDRESS]
                            [--yes] [--size-by-simulation]

Pipe data to @fetch(stdin:) with a script file; run - reads EVML source instead.
Printed output goes to stdout; status messages go to stderr.
With a wallet, a run whose status boxes are still live after the last line
keeps following them (a Safe proposal, a TWAP order); Ctrl-C stops following.

Signing:
  --wallet-rpc URL --account ADDRESS
                        Sign through an external wallet's RPC endpoint.
  EVMCRISPR_PRIVATE_KEY Sign with this key instead (environment only, never
                        an argument; not with --wallet-rpc or --account).
                        Every signature is shown and asked y/N first.
  --yes                 Sign what the local key is asked to without asking
                        (still shown). Required to sign without a terminal.
  --size-by-simulation  Size frame gas limits from a provisional transaction
                        (accepted; frame transactions are not sent yet).`;
const VALUED = ["--wallet-rpc", "--account"];
const FLAGS = ["--yes", "--size-by-simulation"];
const KEY_ENV = "EVMCRISPR_PRIVATE_KEY";

/**
 * The local key, removed from `process.env` before any module loads, so
 * no code of the run (modules, EVML) reads it from there, and it is never
 * passed into the EVML environment. Its value never appears in an error.
 * Not covered: under Bun, a `Bun.spawn` or `Worker` started without an
 * explicit `env` still inherits the process's original environment, key
 * included; and a process of the same user can read /proc/<pid>/environ.
 */
function takePrivateKey(): Hex | undefined {
  const raw = process.env[KEY_ENV];
  delete process.env[KEY_ENV];
  if (raw === undefined || raw === "") return undefined;
  const key = raw.trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(key))
    throw new Error(`${KEY_ENV} is not a private key (32 bytes in hex)`);
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

export async function runScript(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const [file, ...rest] = args;
  if (!file) throw new Error(USAGE);
  const opts: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (FLAGS.includes(key) && !flags.has(key)) {
      flags.add(key);
      continue;
    }
    const value = rest[i + 1];
    if (!VALUED.includes(key) || !value || opts[key]) throw new Error(USAGE);
    opts[key] = value;
    i++;
  }
  const privateKey = takePrivateKey();
  if (privateKey && (opts["--wallet-rpc"] || opts["--account"]))
    throw new Error(
      `${KEY_ENV} cannot be used with --wallet-rpc or --account: choose one way to sign`,
    );
  if (!!opts["--wallet-rpc"] !== !!opts["--account"])
    throw new Error("--wallet-rpc and --account must be supplied together");
  if (opts["--account"] && !isAddress(opts["--account"]))
    throw new Error("invalid --account address");
  // Read by the frame-transaction handler; accepted here so scripts can
  // already pass it.
  const sizeBySimulation = flags.has("--size-by-simulation");
  void sizeBySimulation;
  registerAllModules();
  const source = await readScriptSource(file);
  // The shell supplies data. `run -` reserves stdin for EVML source instead.
  const stdin =
    file !== "-" && !process.stdin.isTTY ? await readStdin() : undefined;
  const chainId = getDefaultChainId();
  const transports: Record<number, Transport> = {};
  // Pure scripts need no RPC configuration. RPC is resolved only when used.
  for (const id of new Set([
    chainId,
    ...Object.keys(process.env)
      .filter((k) => /^EVMCRISPR_RPC_URL_\d+$/.test(k))
      .map((k) => Number(k.slice("EVMCRISPR_RPC_URL_".length))),
  ])) {
    try {
      transports[id] = http(getRpcUrl(id));
    } catch {
      /* Core uses the chain's default RPC when available. */
    }
  }
  let account = opts["--account"] as Address | undefined;
  let wallet: WalletClient | undefined;
  if (privateKey) {
    let local: LocalAccount;
    try {
      local = privateKeyToAccount(privateKey);
    } catch {
      throw new Error(`${KEY_ENV} is not a private key (32 bytes in hex)`);
    }
    const signer = confirmingAccount(
      local,
      makeConfirm({
        yes: flags.has("--yes"),
        // `run -` has read its source from stdin: no answer can follow.
        tty: file !== "-" && !!process.stdin.isTTY && !!process.stderr.isTTY,
        input: process.stdin,
        output: process.stderr,
      }),
    );
    account = signer.address;
    // Wallet requests from EVML (`sign`, permits, Safe signatures) go
    // through the signer too, never to the node, which may hold the same
    // key unlocked.
    wallet = localWallet(signer, chainId, getRpcUrl(chainId));
  } else if (account) {
    wallet = createWalletClient({
      account,
      transport: http(opts["--wallet-rpc"]),
    });
  }
  // Ctrl-C cancels: the run stops, live status boxes end cancelled and the
  // run rejects with "Execution cancelled" (exit code 1). After the script
  // ended (while it follows status boxes) it only stops following: the run
  // succeeded, so it exits 0.
  const controller = new AbortController();
  const onInterrupt = () => {
    console.error("Cancelling…");
    controller.abort();
  };
  process.once("SIGINT", onInterrupt);
  let finished = false;
  const notice = followNotice((line) => console.error(line));
  try {
    await evml
      .with({
        chainId,
        stdin,
        account,
        transports,
        // Status box lines arrive here too (tagged), one per update.
        onLog: (line) => console.error(line),
        onOutput: (line) => process.stdout.write(`${line}\n`),
        onBox: notice.onBox,
        onLine: notice.onLine,
      })
      .script(source)
      .execute(wallet, {
        prepareChains: false,
        signal: controller.signal,
      });
    finished = true;
    if (controller.signal.aborted) console.error("Stopped following.");
  } finally {
    process.off("SIGINT", onInterrupt);
    // A cancelled send can leave a wallet request open (a prompt nobody
    // answers, a receipt wait) that keeps the process alive: exit once
    // the cancellation has been reported. Unref'd, so a run that ends on
    // its own is never cut short.
    if (controller.signal.aborted)
      setTimeout(
        () => process.exit(finished ? 0 : (process.exitCode ?? 1)),
        100,
      ).unref();
  }
}
