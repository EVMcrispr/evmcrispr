import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import {
  COLLECTIONS_ADDRESS,
  CORE_ADDRESS,
  EXPRESSIONS_ADDRESS,
  OPERATIONS_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import { concat, getContractAddress, pad } from "viem";
import {
  ASSERTIONS_REPO,
  CREATE2_PROXY,
  deployCalldata,
  loadDeployments,
} from "../deploy-assertions";

describe("deploy-assertions", () => {
  it("sends salt ‖ creation code to the CREATE2 proxy", () => {
    const salt = pad("0x01");
    expect(deployCalldata(salt, "0x6000")).toBe(concat([salt, "0x6000"]));
  });

  it.skipIf(!existsSync(ASSERTIONS_REPO))(
    "deploys each contract at the address the SDK reads it from",
    async () => {
      const deployments = await loadDeployments(ASSERTIONS_REPO);
      expect(deployments.map((d) => d.address)).toEqual([
        CORE_ADDRESS,
        OPERATIONS_ADDRESS,
        COLLECTIONS_ADDRESS,
        EXPRESSIONS_ADDRESS,
      ]);
      for (const d of deployments)
        expect(
          getContractAddress({
            opcode: "CREATE2",
            from: CREATE2_PROXY,
            salt: d.salt,
            bytecode: d.creation,
          }),
        ).toBe(d.address);
    },
  );
});
