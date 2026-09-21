import { evml } from "@evmcrispr/core";
import {
  type Address,
  createWalletClient,
  http,
  isAddress,
  type Transport,
} from "viem";
import { getDefaultChainId, getRpcUrl } from "../lib/config";
import { registerAllModules } from "../lib/modules";
import { readScriptSource, readStdin } from "../lib/read-source";

const USAGE = `Usage: evmcrispr run <file|-> [--wallet-rpc URL --account ADDRESS]

Pipe data to @fetch(stdin:) with a script file; run - reads EVML source instead.
Printed output goes to stdout; status messages go to stderr.`;
export async function runScript(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const [file, ...rest] = args;
  if (!file) throw new Error(USAGE);
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i],
      value = rest[i + 1];
    if (!["--wallet-rpc", "--account"].includes(key) || !value || opts[key])
      throw new Error(USAGE);
    opts[key] = value;
  }
  if (!!opts["--wallet-rpc"] !== !!opts["--account"])
    throw new Error("--wallet-rpc and --account must be supplied together");
  if (opts["--account"] && !isAddress(opts["--account"]))
    throw new Error("invalid --account address");
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
  const account = opts["--account"] as Address | undefined;
  const wallet = account
    ? createWalletClient({ account, transport: http(opts["--wallet-rpc"]) })
    : undefined;
  await evml
    .with({
      chainId,
      stdin,
      account,
      transports,
      onLog: (line) => console.error(line),
      onOutput: (line) => process.stdout.write(`${line}\n`),
    })
    .script(source)
    .execute(wallet, {
      prepareChains: false,
    });
}
