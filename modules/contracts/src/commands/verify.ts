import type { EtherscanSourceResult, Param } from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeConstructorParams,
  fetchVerifiedContractFull,
  readEtherscanApiKey,
  resolveChainId,
} from "@evmcrispr/sdk";
import { getAddress, isAddressEqual } from "viem";
import type Contracts from "..";
import {
  compileStandardJson,
  matchesDeployedBytecode,
  selectVerifyTarget,
  withDeployedBytecodeSelection,
} from "../utils/verification";

const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";

/**
 * SPDX → numeric Etherscan license id mapping.
 *
 * Etherscan's `verifysourcecode` endpoint takes a numeric `licenseType`
 * separate from the source. The mapping below covers the licenses
 * Etherscan supports (1–14). Keys are upper-cased SPDX identifiers as
 * returned by `getsourcecode`'s `LicenseType` field. Missing entries
 * fall through to `1` (No License) so explicit-mode users with an
 * unrecognised SPDX still verify.
 */
const SPDX_TO_ETHERSCAN_LICENSE: Record<string, number> = {
  NONE: 1,
  UNLICENSE: 2,
  MIT: 3,
  "GPL-2.0": 4,
  "GPL-3.0": 5,
  "LGPL-2.1": 6,
  "LGPL-3.0": 7,
  "BSD-2-CLAUSE": 8,
  "BSD-3-CLAUSE": 9,
  "MPL-2.0": 10,
  "OSL-3.0": 11,
  "APACHE-2.0": 12,
  "AGPL-3.0": 13,
  "BSL-1.1": 14,
};

function spdxToLicenseId(spdx: string | undefined): number {
  if (!spdx) return 1;
  return SPDX_TO_ETHERSCAN_LICENSE[spdx.toUpperCase()] ?? 1;
}

/**
 * Etherscan's `getsourcecode` `SourceCode` field comes back in three
 * possible shapes depending on how the source was originally verified:
 *
 *  1. `{{ ... }}` — a Standard JSON Input that Etherscan double-brace
 *     wraps. Strip the outer braces to recover the raw JSON.
 *  2. `{ "Foo.sol": { "content": "..." }, ... }` — a flat multi-file
 *     dict (legacy multi-file verification format).
 *  3. Plain Solidity text — single-file verification.
 *
 * We always submit `solidity-standard-json-input` to Etherscan, so this
 * helper normalises (2) and (3) into a fresh Standard JSON, synthesising
 * `settings` from the sibling fields (`OptimizationUsed`, `Runs`,
 * `EVMVersion`, `Library`) returned by the same `getsourcecode`
 * response.
 */
function normalizeMirrorSourceToStandardJson(
  entry: EtherscanSourceResult,
  fileName: string,
): string {
  const raw = (entry.SourceCode ?? "").trim();

  if (raw.startsWith("{{") && raw.endsWith("}}")) {
    return raw.slice(1, -1);
  }

  const settings = buildSettings(entry);

  if (raw.startsWith("{")) {
    let sources: Record<string, { content: string }> | undefined;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        sources = parsed as Record<string, { content: string }>;
      }
    } catch {
      /* fall through to single-source wrap */
    }
    if (sources) {
      return JSON.stringify({
        language: "Solidity",
        sources,
        settings,
      });
    }
  }

  return JSON.stringify({
    language: "Solidity",
    sources: { [fileName]: { content: raw } },
    settings,
  });
}

function buildSettings(entry: EtherscanSourceResult): Record<string, unknown> {
  const optimizer: Record<string, unknown> = {
    enabled: entry.OptimizationUsed === "1",
    runs:
      entry.OptimizationUsed === "1" ? Number(entry.Runs ?? 200) || 200 : 200,
  };

  const settings: Record<string, unknown> = { optimizer };

  if (entry.EVMVersion && entry.EVMVersion !== "Default") {
    settings.evmVersion = entry.EVMVersion;
  }

  const libraries = parseLibraries(entry.Library);
  if (libraries) settings.libraries = libraries;

  return settings;
}

/**
 * Etherscan's `Library` field is a comma-separated list of
 * `LibName:0xAddress` pairs. Map them under the conventional
 * `<sourceFile>` placeholder so the JSON is well-formed; if the user
 * cares about exact paths they can override via explicit mode.
 */
function parseLibraries(
  raw: string | undefined,
): Record<string, Record<string, string>> | undefined {
  if (!raw?.trim()) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const [name, addr] = pair.split(":").map((s) => s.trim());
    if (name && addr) out[name] = addr;
  }
  if (Object.keys(out).length === 0) return undefined;
  return { "": out };
}

function normalizeCompilerVersion(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function normalizeConstructorArgs(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("0x") ? raw.slice(2) : raw;
}

interface SubmitVerifyResponse {
  status: string;
  message?: string;
  result?: string;
}

async function submitVerification(
  url: URL,
  body: URLSearchParams,
): Promise<SubmitVerifyResponse> {
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new ErrorException(
      `verify: Etherscan submit failed (HTTP ${res.status} ${res.statusText})`,
    );
  }
  return (await res.json()) as SubmitVerifyResponse;
}

async function pollVerification(
  apiKey: string,
  chainId: number,
  guid: string,
  timeoutSec: number,
  intervalSec: number,
  log: (msg: string) => void,
): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000;

  while (Date.now() < deadline) {
    const url = new URL(ETHERSCAN_V2_URL);
    url.searchParams.set("chainid", String(chainId));
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "checkverifystatus");
    url.searchParams.set("guid", guid);
    url.searchParams.set("apikey", apiKey);

    let json: SubmitVerifyResponse;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new ErrorException(
          `verify: status check failed (HTTP ${res.status} ${res.statusText})`,
        );
      }
      json = (await res.json()) as SubmitVerifyResponse;
    } catch (err) {
      if (err instanceof ErrorException) throw err;
      throw new ErrorException(
        `verify: status check error – ${err instanceof Error ? err.message : err}`,
      );
    }

    const result = (json.result ?? "").toString();
    const lower = result.toLowerCase();

    if (lower.includes("pass") || lower.includes("already verified")) {
      log(`verified: ${result}`);
      return;
    }
    if (
      lower.includes("fail") ||
      lower.includes("unable") ||
      json.status === "0"
    ) {
      // Pending shows up as `Pending in queue` with status "0" too — only
      // bail when the message clearly indicates failure.
      if (lower.includes("pending")) {
        // keep polling
      } else {
        throw new ErrorException(
          `verify: ${result || json.message || "failed"}`,
        );
      }
    }

    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }

  throw new ErrorException(
    `verify: timed out after ${timeoutSec}s waiting for Etherscan to finish verification`,
  );
}

export default defineCommand<Contracts>({
  name: "verify",
  description:
    "Submit Solidity Standard JSON Input source code to Etherscan V2 for verification at <address>. Mirror an existing verification with --mirror-chain / --mirror-address, or supply source explicitly with --source. Inside sim:fork this becomes a local dry-run: the source is compiled and checked against the fork's deployed bytecode instead of being sent to Etherscan.",
  batchable: false,
  args: [
    {
      name: "address",
      type: "address",
      description: "Deployed contract address on the current chain to verify.",
    },
  ],
  opts: [
    {
      name: "mirror-chain",
      type: "chain",
      description:
        "Chain (id or viem name like `optimism`) to mirror an existing verification from. Defaults to the current chain when only --mirror-address is set.",
    },
    {
      name: "mirror-address",
      type: "address",
      description:
        "Existing verified contract to mirror. Defaults to <address> when only --mirror-chain is set.",
    },
    {
      name: "source",
      type: "string",
      description:
        "Solidity Standard JSON Input text including language, sources, and settings. Required for explicit (non-mirror) mode.",
    },
    {
      name: "contract-name",
      type: "string",
      description:
        "Qualified contract name `path/File.sol:ContractName`. Required for explicit mode.",
    },
    {
      name: "compiler",
      type: "string",
      description:
        "Solidity compiler version, e.g. `0.8.20+commit.a1b79de6`. Required for explicit mode.",
    },
    {
      name: "license",
      type: "string",
      description:
        "SPDX license identifier (e.g. MIT, Apache-2.0). Defaults to `None` in explicit mode; mirrored in mirror mode.",
    },
    {
      name: "constructor",
      type: "string",
      description:
        "Constructor signature like `constructor(uint256,address)`. Requires --constructor-args.",
    },
    {
      name: "constructor-args",
      type: "array",
      description:
        "Constructor arguments as an array literal, e.g. [100e18 @me]. Requires --constructor.",
    },
    {
      name: "constructor-args-hex",
      type: "bytes",
      description:
        "Pre-encoded ABI constructor arguments as hex. Mutually exclusive with --constructor / --constructor-args.",
    },
    {
      name: "timeout",
      type: "number",
      description:
        "Maximum time to wait for verification to complete, in time units (default 60s).",
    },
    {
      name: "poll-interval",
      type: "number",
      description: "Time between status polls, in time units (default 3s).",
    },
  ],
  async run(module, { address }, { opts, interpreters }) {
    // Inside a sim:fork block verification becomes a local dry-run, which
    // needs no Etherscan API key. Mirror-mode *fetching* is also keyless
    // now (Blockscout fallback); only the real Etherscan submission needs
    // the key.
    const simulation = interpreters.simulation === true;
    const apiKey = readEtherscanApiKey();

    const targetAddress = getAddress(address as `0x${string}`);
    const targetChainId = await module.getChainId();

    const ctorSig = Object.hasOwn(opts, "constructor")
      ? // biome-ignore lint/complexity/useLiteralKeys: dot access resolves to Object.prototype.constructor (Function)
        (opts["constructor"] as string | undefined)
      : undefined;
    const ctorArgs = opts["constructor-args"] as Param[] | undefined;
    const ctorArgsHex = opts["constructor-args-hex"] as
      | `0x${string}`
      | undefined;

    if (ctorSig && !ctorArgs) {
      throw new ErrorException(
        "verify --constructor requires --constructor-args (use [] for zero args)",
      );
    }
    if (!ctorSig && ctorArgs) {
      throw new ErrorException(
        "verify --constructor-args requires --constructor",
      );
    }
    if (ctorArgsHex !== undefined && (ctorSig || ctorArgs)) {
      throw new ErrorException(
        "verify: --constructor-args-hex is mutually exclusive with --constructor / --constructor-args",
      );
    }

    const mirrorChainOptRaw = opts["mirror-chain"];
    const mirrorChainOpt =
      mirrorChainOptRaw === undefined
        ? undefined
        : resolveChainId(mirrorChainOptRaw);
    const mirrorAddressOpt = opts["mirror-address"] as
      | `0x${string}`
      | undefined;
    const isMirror =
      mirrorChainOpt !== undefined || mirrorAddressOpt !== undefined;

    let sourceCode: string;
    let contractName: string;
    let compilerVersion: string;
    let licenseId: number;
    let mirrorCtorArgsHex = "";

    if (isMirror) {
      const mirrorChain = mirrorChainOpt ?? targetChainId;
      const mirrorAddress = getAddress(mirrorAddressOpt ?? targetAddress);

      if (
        mirrorChain === targetChainId &&
        isAddressEqual(mirrorAddress, targetAddress)
      ) {
        throw new ErrorException(
          "verify: refusing to self-mirror — resolved (--mirror-chain, --mirror-address) equals (currentChain, address). Pass a different source, or use explicit --source mode.",
        );
      }

      module.context.log(
        `verify: fetching verified source from chain ${mirrorChain} at ${mirrorAddress}…`,
      );
      const mirror = await fetchVerifiedContractFull(
        mirrorChain,
        mirrorAddress,
      );
      if (!mirror) {
        throw new ErrorException(
          `verify: no verified source on chain ${mirrorChain} for address ${mirrorAddress}`,
        );
      }

      const mirrorContractName = (mirror.ContractName ?? "").trim();
      if (!mirrorContractName) {
        throw new ErrorException(
          `verify: source on chain ${mirrorChain} for ${mirrorAddress} is missing a ContractName`,
        );
      }

      const fileName = `${mirrorContractName}.sol`;
      sourceCode =
        (opts.source as string | undefined) ??
        normalizeMirrorSourceToStandardJson(mirror, fileName);

      const explicitName = opts["contract-name"] as string | undefined;
      contractName =
        explicitName ??
        // For mirrored single-file or normalised wrappers we use the
        // synthesised qualified name so Etherscan can pick the right
        // contract out of the standard JSON.
        (sourceCode.startsWith(`{`) && sourceCode.includes(`"sources"`)
          ? `${fileName}:${mirrorContractName}`
          : mirrorContractName);

      const explicitCompiler = opts.compiler as string | undefined;
      compilerVersion = normalizeCompilerVersion(
        explicitCompiler ?? mirror.CompilerVersion,
      );

      const explicitLicense = opts.license as string | undefined;
      licenseId = spdxToLicenseId(explicitLicense ?? mirror.LicenseType);

      mirrorCtorArgsHex = normalizeConstructorArgs(mirror.ConstructorArguments);
    } else {
      const explicitSource = opts.source as string | undefined;
      const explicitName = opts["contract-name"] as string | undefined;
      const explicitCompiler = opts.compiler as string | undefined;

      if (!explicitSource || !explicitName || !explicitCompiler) {
        throw new ErrorException(
          "verify: explicit mode requires --source, --contract-name, and --compiler (or use --mirror-chain / --mirror-address to mirror an existing verification)",
        );
      }

      sourceCode = explicitSource;
      contractName = explicitName;
      compilerVersion = normalizeCompilerVersion(explicitCompiler);
      licenseId = spdxToLicenseId(opts.license as string | undefined);
    }

    let constructorArgsHex = "";
    if (ctorArgsHex !== undefined) {
      constructorArgsHex = normalizeConstructorArgs(ctorArgsHex);
    } else if (ctorSig) {
      const encoded = encodeConstructorParams(ctorSig, ctorArgs ?? []);
      constructorArgsHex = encoded.startsWith("0x")
        ? encoded.slice(2)
        : encoded;
    } else if (isMirror) {
      constructorArgsHex = mirrorCtorArgsHex;
    }

    if (simulation) {
      // ── sim:fork dry-run: compile locally and diff against fork code ──
      const bareVersion = compilerVersion.replace(/^v/, "");
      module.context.log(
        `verify (dry-run): compiling ${contractName} with solc v${bareVersion}…`,
      );
      const output = await compileStandardJson(
        withDeployedBytecodeSelection(sourceCode),
        bareVersion,
        (m) => module.context.log(m),
      );
      const target = selectVerifyTarget(output, contractName);
      const client = await module.getClient();
      const onchain = await client.getCode({ address: targetAddress });
      if (!onchain || onchain === "0x") {
        throw new ErrorException(
          `verify: no deployed code at ${targetAddress} on the fork`,
        );
      }
      const result = matchesDeployedBytecode(onchain, target.deployedBytecode, {
        immutableReferences: target.immutableReferences,
        linkReferences: target.linkReferences,
      });
      if (!result.match) {
        throw new ErrorException(
          `verify: deployed bytecode at ${targetAddress} does not match ${contractName} compiled with solc v${bareVersion} — ${result.reason}`,
        );
      }
      module.context.log(
        `:success: verify (dry-run): ${targetAddress} matches ${contractName} — would verify on Etherscan`,
      );
      return [];
    }

    if (!apiKey) {
      throw new ErrorException(
        "verify: VITE_ETHERSCAN_API_KEY env var is required",
      );
    }

    // Etherscan V2 requires `apikey`, `chainid`, `module`, and `action`
    // as URL query parameters even for POST. The actual contract payload
    // (sourceCode etc.) is sent as the form body — `sourceCode` would
    // otherwise blow the URL length limit.
    const url = new URL(ETHERSCAN_V2_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("chainid", String(targetChainId));
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "verifysourcecode");

    const body = new URLSearchParams();
    body.set("contractaddress", targetAddress);
    body.set("sourceCode", sourceCode);
    body.set("codeformat", "solidity-standard-json-input");
    body.set("contractname", contractName);
    body.set("compilerversion", compilerVersion);
    body.set("licenseType", String(licenseId));
    if (constructorArgsHex) {
      // Etherscan's documented field is misspelled `constructorArguements`.
      body.set("constructorArguements", constructorArgsHex);
    }

    module.context.log(
      `verify: submitting ${targetAddress} on chain ${targetChainId} to Etherscan…`,
    );

    const submit = await submitVerification(url, body);

    // Etherscan replies with `status: "0"` and `result: "Contract source
    // code already verified"` when re-submitting an address that's already
    // verified. The user's intent (have this address verified) is met, so
    // treat it as success and skip polling — there's no GUID to poll.
    const submitResultLower = (submit.result ?? "").toString().toLowerCase();
    if (submitResultLower.includes("already verified")) {
      module.context.log(`verify: ${submit.result}`);
      return [];
    }

    if (submit.status !== "1" || !submit.result) {
      throw new ErrorException(
        `verify: Etherscan rejected submission – ${submit.result || submit.message || "unknown error"}`,
      );
    }

    const guid = submit.result;
    module.context.log(`verify: submitted (guid=${guid}); polling status…`);

    const timeoutSec = Number(opts.timeout ?? 60);
    const intervalSec = Number(opts["poll-interval"] ?? 3);

    await pollVerification(
      apiKey,
      targetChainId,
      guid,
      timeoutSec,
      intervalSec,
      (msg) => module.context.log(`verify: ${msg}`),
    );

    return [];
  },
});
