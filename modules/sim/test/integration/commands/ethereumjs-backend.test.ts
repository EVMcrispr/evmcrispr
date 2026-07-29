import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";

import { getForkBlockNumber } from "../../../../../scripts/anvil-config";
import { describeIntegrationBackendSuite } from "./backend-suite";

const FORK_BLOCK_NUMBER = await getForkBlockNumber();

describeIntegrationBackendSuite("ethereumjs");

describe("ethereumjs backend – default mode", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  it("fork defaults to ethereumjs when --using is omitted", async () => {
    const s = `load sim\nsim:fork --block-number ${FORK_BLOCK_NUMBER} (\n  sim:expect true\n)`;
    const interpreter = createInterpreter(s, client);
    await interpreter.interpret();
  });
});
