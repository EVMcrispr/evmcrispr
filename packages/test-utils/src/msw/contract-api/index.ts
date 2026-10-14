import { HttpResponse, http } from "msw";
import { isAddress } from "viem";
import { etherscanVerifiedFixtures } from "../etherscan";

/** One entry of an Etherscan `getsourcecode` fixture. */
interface EtherscanEntry {
  SourceCode?: string;
  ABI?: string;
  ContractName?: string;
  CompilerVersion?: string;
  OptimizationUsed?: string;
  Runs?: string;
  EVMVersion?: string;
  LicenseType?: string;
  Proxy?: string;
}

/** The fixture's source as path → content, the three ways Etherscan
 * writes it (as the API reads it). */
function sourceFiles(entry: EtherscanEntry): Record<string, string> {
  const raw = (entry.SourceCode ?? "").trim();
  if (!raw) return {};
  const json =
    raw.startsWith("{{") && raw.endsWith("}}")
      ? raw.slice(1, -1)
      : raw.startsWith("{")
        ? raw
        : undefined;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      const dict = parsed.sources ?? parsed;
      const files: Record<string, string> = {};
      for (const [path, value] of Object.entries(dict)) {
        const content = (value as { content?: unknown })?.content;
        if (typeof content === "string") files[path] = content;
      }
      if (Object.keys(files).length > 0) return files;
    } catch {
      /* the text of one file */
    }
  }
  return { [`${entry.ContractName?.trim() || "Contract"}.sol`]: raw };
}

function verifiedEntry(address: string): EtherscanEntry | undefined {
  const fixture = etherscanVerifiedFixtures[address.toLowerCase()] as
    | { result?: EtherscanEntry[] }
    | undefined;
  return fixture?.result?.[0];
}

/** What `/contract/<chainId>/<address>` answers for a fixture (and
 * `/source`, with the files' contents for `files`). Like the real routes,
 * it carries no implementation address. */
export function contractApiMetadata(entry: EtherscanEntry) {
  const license = entry.LicenseType?.trim();
  const evmVersion = entry.EVMVersion;
  return {
    name: entry.ContractName?.trim() ?? "",
    abi: JSON.parse(entry.ABI || "[]"),
    compilerVersion: (entry.CompilerVersion ?? "").replace(/^v/, ""),
    optimizationUsed: entry.OptimizationUsed === "1",
    runs: Number(entry.Runs ?? 0) || 0,
    ...(evmVersion && evmVersion.toLowerCase() !== "default"
      ? { evmVersion }
      : {}),
    ...(license && !["None", "Unknown"].includes(license) ? { license } : {}),
    isProxy: entry.Proxy === "1",
    files: Object.keys(sourceFiles(entry)),
  };
}

const notVerified = (chainId: string, address: string) =>
  HttpResponse.json(
    { error: "contract not verified", chainId, address: address.toLowerCase() },
    { status: 404 },
  );

const invalid = (chainId: string, address: string) =>
  HttpResponse.json(
    { error: "invalid address or chain id", chainId, address },
    { status: 400 },
  );

/**
 * The EVMcrispr API's keyless contract routes, which the sdk asks when it
 * has neither an Etherscan key nor a proxy. They serve the same fixtures
 * as the Etherscan V2 mock (`etherscanVerifiedFixtures`), so keyless flows
 * resolve the same contracts; any other address is `404` not verified, as
 * the real routes answer, and the sdk goes on to Blockscout.
 */
export const contractApiHandlers = [
  http.get<{ chainId: string; address: string }>(
    "https://api.evmcrispr.com/contract/:chainId/:address",
    ({ params }) => {
      const { chainId, address } = params;
      if (!/^\d+$/.test(chainId) || !isAddress(address, { strict: false }))
        return invalid(chainId, address);
      const entry = verifiedEntry(address);
      if (!entry) return notVerified(chainId, address);
      return HttpResponse.json(contractApiMetadata(entry));
    },
  ),
  http.get<{ chainId: string; address: string }>(
    "https://api.evmcrispr.com/source/:chainId/:address",
    ({ params, request }) => {
      const { chainId, address } = params;
      if (!/^\d+$/.test(chainId) || !isAddress(address, { strict: false }))
        return invalid(chainId, address);
      const entry = verifiedEntry(address);
      if (!entry) return notVerified(chainId, address);
      const name = entry.ContractName?.trim() ?? "";
      const files = sourceFiles(entry);
      const file = new URL(request.url).searchParams.get("file");
      if (file === null)
        return HttpResponse.json({ ...contractApiMetadata(entry), files });
      if (!(file in files))
        return HttpResponse.json(
          { error: "no such file", file, files: Object.keys(files) },
          { status: 404 },
        );
      return HttpResponse.json({ name, files: { [file]: files[file] } });
    },
  ),
];
