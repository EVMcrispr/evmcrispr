/** Build upstream releases first; this script pins only artifacts used by local tests. */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sources = [
  {
    name: "kernel",
    root: process.env.KERNEL_FIXTURE_ROOT,
    revision: "03f7f5cf5871cda0070e4223f196f5b577f6cde2",
    repository: "https://github.com/zerodevapp/kernel",
    compiler: "0.8.36",
    optimizerRuns: 200,
    contracts: ["Kernel", "KernelFactory", "ECDSAValidator"],
  },
  {
    name: "nexus",
    root: process.env.NEXUS_FIXTURE_ROOT,
    revision: "8db1a6e41780dd0cc85298b0cbe6ab493adc6bb5",
    repository: "https://github.com/bcnmy/nexus",
    compiler: "0.8.27",
    optimizerRuns: 777,
    contracts: [
      "Nexus",
      "NexusAccountFactory",
      "NexusBootstrap",
      "K1Validator",
      "EntryPoint",
    ],
  },
];
for (const source of sources) {
  if (!source.root)
    throw new Error(
      `Set ${source.name.toUpperCase()}_FIXTURE_ROOT to the pinned upstream checkout`,
    );
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: source.root,
    encoding: "utf8",
  }).trim();
  if (revision !== source.revision)
    throw new Error(`Unexpected ${source.name} revision ${revision}`);
  const contracts = Object.fromEntries(
    source.contracts.map((name) => {
      const artifact = JSON.parse(
        readFileSync(`${source.root}/out/${name}.sol/${name}.json`, "utf8"),
      );
      return [name, { abi: artifact.abi, bytecode: artifact.bytecode.object }];
    }),
  );
  writeFileSync(
    new URL(
      `../packages/test-utils/src/onchain/fixtures/${source.name}.json`,
      import.meta.url,
    ),
    `${JSON.stringify(
      {
        provenance: {
          repository: source.repository,
          revision,
          compiler: source.compiler,
          settings: {
            optimizer: true,
            optimizerRuns: source.optimizerRuns,
            viaIR: true,
            evmVersion: "cancun",
          },
          license: "MIT",
          note: "Creation bytecode; deploy normally so constructors, immutables and validators remain authentic. Nexus uses Cancun target and PREP commit from its yarn.lock.",
        },
        contracts,
      },
      null,
      2,
    )}\n`,
  );
}
