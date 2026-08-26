import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  Num,
} from "@evmcrispr/sdk";
import type Gelato from "..";
import { bundleWeb3Function, MAX_BUNDLE_BYTES } from "../utils/bundler";
import { parseUserArgsSchema } from "../utils/entries";
import { rememberFunctionSchema } from "../utils/functionSchema";
import { packWeb3Function, type Web3FunctionSchema } from "../utils/tgz";
import { uploadWeb3Function } from "../utils/upload";

/** web3function.schema.json: memory enum, timeout range, sdk major. */
const MEMORY_OPTIONS = [128, 256, 512];
const TIMEOUT_MIN = 5;
const TIMEOUT_MAX = 300;
const WEB3_FUNCTION_VERSION = "2.0.0";
const RUNTIME = "js-1.0";

function parseMemory(value: unknown): number {
  if (value === undefined) return 128;
  const n = Number(Num(value as string).toString());
  if (!MEMORY_OPTIONS.includes(n)) {
    throw new ErrorException(
      `--memory must be one of ${MEMORY_OPTIONS.join(", ")} (MB), got ${value}`,
    );
  }
  return n;
}

function parseTimeout(value: unknown): number {
  if (value === undefined) return 30;
  const n = Number(Num(value as string).toString());
  if (!Number.isInteger(n) || n < TIMEOUT_MIN || n > TIMEOUT_MAX) {
    throw new ExceptionTimeout(value);
  }
  return n;
}

class ExceptionTimeout extends ErrorException {
  constructor(value: unknown) {
    super(
      `--timeout must be a whole number of seconds between ${TIMEOUT_MIN} and ${TIMEOUT_MAX} (a duration like 30s works), got ${value}`,
    );
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default defineCommand<Gelato>({
  name: "publish-function",
  description:
    "Bundle a TypeScript Web3 Function written inline (a <<<TS heredoc) and publish it to Gelato's function store, binding the resulting CID to <variable> for gelato:automate --function. Bundling runs in the terminal with esbuild: import @gelatonetwork/web3-functions-sdk, ethers or ky bare, anything else pinned as pkg@1.2.3; every package comes from a tarball verified against the npm registry. In a simulation the function is bundled and validated but not uploaded, and <variable> gets a placeholder CID.",
  batchable: false,
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the published CID to",
    },
    {
      name: "source",
      type: "string",
      description: "TypeScript source of the function (use a <<<TS heredoc)",
    },
  ],
  opts: [
    {
      name: "user-args",
      type: "any",
      description:
        "User args the function declares, as an entries array of [name type] pairs — types string, number, boolean or their [] arrays, e.g. [[vault string] [threshold number]]",
    },
    {
      name: "memory",
      type: "number",
      description: "Memory limit in MB: 128 (default), 256 or 512",
    },
    {
      name: "timeout",
      type: "number",
      description: "Execution timeout in seconds, 5 to 300 (default 30)",
    },
    {
      name: "title",
      type: "string",
      description: "Name shown in the Gelato app (default Web3Function)",
    },
  ],
  async run(module, { variable, source }, { opts, interpreters }) {
    if (typeof source !== "string" || !source.trim()) {
      throw new ErrorException("<source> must be the function's TypeScript");
    }
    const schema: Web3FunctionSchema = {
      web3FunctionVersion: WEB3_FUNCTION_VERSION,
      runtime: RUNTIME,
      memory: parseMemory(opts.memory),
      timeout: parseTimeout(opts.timeout),
      userArgs:
        opts["user-args"] === undefined
          ? {}
          : parseUserArgsSchema(opts["user-args"], "--user-args"),
    };
    const title =
      opts.title === undefined ? "Web3Function" : String(opts.title);

    const log = (message: string) => module.context.log(message);
    const { indexJs, sourceJs, warnings } = await bundleWeb3Function(
      source,
      log,
    );
    for (const warning of warnings) {
      log(`:warning: gelato:publish-function: ${warning}`);
    }
    const tgz = await packWeb3Function({ indexJs, sourceJs, schema });
    if (tgz.length > MAX_BUNDLE_BYTES) {
      throw new ErrorException(
        `the bundled function is ${(tgz.length / 1024).toFixed(0)} KB compressed; Gelato serves at most ${MAX_BUNDLE_BYTES / 1024} KB — trim its imports`,
      );
    }
    const kb = (indexJs.length / 1024).toFixed(0);

    let cid: string;
    if (interpreters.simulation) {
      cid = `simulated-${(await sha256Hex(tgz)).slice(0, 16)}`;
      log(
        `simulation: gelato:publish-function bundled ${kb} KB — not uploaded, ${variable} holds the placeholder ${cid}`,
      );
    } else {
      cid = await uploadWeb3Function(tgz, title);
      log(`:success: gelato:publish-function: ${kb} KB published as ${cid}`);
    }
    rememberFunctionSchema(cid, schema.userArgs as Record<string, never>);
    module.bindingsManager.setBinding(
      variable,
      cid,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    return [];
  },
});
