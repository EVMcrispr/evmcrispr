/** Rebuild with forge (Solidity 0.8.27, Cancun, optimizer 200) before syncing. */
import { readFileSync, writeFileSync } from "node:fs";
import { keccak256, toHex } from "viem";

const path = process.env.SMART_PROTOCOL_ARTIFACT;
if (!path)
  throw new Error("Set SMART_PROTOCOL_ARTIFACT to SmartProtocolFixture.json");
const artifact = JSON.parse(readFileSync(path, "utf8"));
const source = readFileSync(
  new URL(
    "../packages/test-utils/src/onchain/fixtures/SmartProtocolFixture.sol",
    import.meta.url,
  ),
  "utf8",
);
writeFileSync(
  new URL(
    "../packages/test-utils/src/onchain/fixtures/smart-protocol.json",
    import.meta.url,
  ),
  `${JSON.stringify({ provenance: { sourceHash: keccak256(toHex(source)), compiler: artifact.metadata.compiler.version, settings: artifact.metadata.settings }, abi: artifact.abi, bytecode: artifact.bytecode.object }, null, 2)}\n`,
);
