---
title: "gelato:publish-function"
---

Bundle a TypeScript Web3 Function written inline (a <<<TS heredoc) and publish it to Gelato's function store, binding the resulting CID to <variable> for gelato:automate --function. Bundling runs in the terminal with esbuild: import @gelatonetwork/web3-functions-sdk, ethers or ky bare, anything else pinned as pkg@1.2.3; every package comes from a tarball verified against the npm registry. In a simulation the function is bundled and validated but not uploaded, and <variable> gets a placeholder CID.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:publish-function <variable> <source>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `variable` | `variable` | Variable to bind the published CID to |
| `source` | `string` | TypeScript source of the function (use a <<<TS heredoc) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--user-args` | `any` | User args the function declares, as an entries array of [name type] pairs — types string, number, boolean or their [] arrays, e.g. [[vault string] [threshold number]] |
| `--memory` | `number` | Memory limit in MB: 128 (default), 256 or 512 |
| `--timeout` | `number` | Execution timeout in seconds, 5 to 300 (default 30) |
| `--title` | `string` | Name shown in the Gelato app (default Web3Function) |

## Examples

```evml
# Publish a function that tops up a vault whenever its balance drops, then schedule it every 5 minutes
gelato:publish-function $cid <<<TS
import { Web3Function, Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk";
import { Contract } from "ethers";

Web3Function.onRun(async ({ userArgs, multiChainProvider }: Web3FunctionContext) => {
  const vault = new Contract(
    userArgs.vault as string,
    ["function needsTopUp() view returns (bool)", "function topUp()"],
    multiChainProvider.default(),
  );
  if (!(await vault.needsTopUp())) return { canExec: false, message: "vault is fine" };
  return {
    canExec: true,
    callData: [{ to: userArgs.vault as string, data: vault.interface.encodeFunctionData("topUp") }],
  };
});
TS --user-args [[vault string]]
gelato:automate --function $cid --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64]] --every 5m
```

<!-- HAND-WRITTEN -->

## Notes

- The source is a single file. Import `@gelatonetwork/web3-functions-sdk`, `ethers`
  (v6) or `ky` bare; any other package must be pinned as `pkg@1.2.3` in the import
  itself. Packages are downloaded as tarballs verified against the npm registry and
  resolved through the audited dependency lock in `src/utils/w3fLock.ts`
  (regenerate with `bun scripts/generate-w3f-lock.ts`). Node.js builtins are not
  available in Gelato's sandbox.
- Bundling mirrors `w3f deploy`: esbuild, browser platform, ESM, es2022, minified.
  The first run downloads esbuild (~4 MB); the compressed function must stay under
  1 MB, Gelato's download limit.
- `--user-args` declares the schema of the values a task passes with `--args`:
  `[[vault string] [threshold number] [flags boolean[]]]`.
- Secrets (API keys the function reads from `secrets`) are set per task in the
  Gelato app, not here.
- In a simulation the function is bundled and validated, nothing is uploaded, and the
  variable holds a `simulated-…` placeholder that `gelato:automate --function`
  still accepts inside the same script.


## See Also
