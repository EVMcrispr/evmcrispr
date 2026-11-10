// Compiles one of the module's contracts with solc-js 0.8.28, resolving
// imports from @forshtat/hegota-support and @openzeppelin/contracts (the
// only two sources it accepts). The settings are the ones hegota-support's
// own compileSolidity uses, so a contract that imports only hegota-support
// compiles to the same bytecode either way.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Abi, Hex } from "viem";

const require = createRequire(import.meta.url);

/** The directory of the package `name`, found from one of its files. */
function packageRoot(entry: string, marker: string): string {
  let dir = dirname(require.resolve(entry));
  while (!existsSync(join(dir, marker))) {
    const up = dirname(dir);
    if (up === dir) throw new Error(`cannot find ${marker} above ${entry}`);
    dir = up;
  }
  return dir;
}

const ROOTS: [prefix: string, root: () => string][] = [
  [
    "@forshtat/hegota-support/",
    () =>
      packageRoot(
        "@forshtat/hegota-support/solidity",
        "contracts/HegotaSupport.sol",
      ),
  ],
  [
    "@openzeppelin/contracts/",
    () => dirname(require.resolve("@openzeppelin/contracts/package.json")),
  ],
];

function findImports(path: string): { contents: string } | { error: string } {
  for (const [prefix, root] of ROOTS) {
    if (!path.startsWith(prefix)) continue;
    const file = join(root(), path.slice(prefix.length));
    return existsSync(file)
      ? { contents: readFileSync(file, "utf8") }
      : { error: `no such file: ${path}` };
  }
  return {
    error: `cannot import "${path}": only ${ROOTS.map(([p]) => `"${p}…"`).join(" and ")} resolve`,
  };
}

export function compileFrameContract(
  name: string,
  source: string,
): { abi: Abi; bytecode: Hex } {
  const solc = require("solc");
  const out = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { [`${name}.sol`]: { content: source } },
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
      { import: findImports },
    ),
  ) as {
    errors?: { severity: string; formattedMessage: string }[];
    contracts?: Record<
      string,
      Record<string, { abi: Abi; evm: { bytecode: { object: string } } }>
    >;
  };
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0)
    throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const contract = out.contracts?.[`${name}.sol`]?.[name];
  if (!contract) throw new Error(`${name}.sol defines no contract "${name}"`);
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}
