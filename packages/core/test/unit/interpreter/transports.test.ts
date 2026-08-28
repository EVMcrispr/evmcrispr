import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { http } from "viem";
import { gnosis } from "viem/chains";
import { createEvml } from "../../../src/evml/tag";
import { Interpreter } from "../../../src/interpreter/Interpreter";

const transportUrl = (client: any): string | undefined =>
  client?.transport?.url;

describe("interpreter > transports", () => {
  it("reads the initial chain through the host's transport", async () => {
    const evm = new Interpreter(createEvml().registry, {
      chainId: gnosis.id,
      transports: { [gnosis.id]: http("http://127.0.0.1:1/initial") },
    });
    expect(transportUrl(await evm.getClient())).to.equal(
      "http://127.0.0.1:1/initial",
    );
  });

  it("keeps using the host's transports after a switch", async () => {
    const evm = new Interpreter(createEvml().registry, {
      chainId: gnosis.id,
      transports: {
        [gnosis.id]: http("http://127.0.0.1:1/initial"),
        1: http("http://127.0.0.1:1/mainnet"),
      },
    });
    evm.switchChainId(1);
    expect(transportUrl(await evm.getClient())).to.equal(
      "http://127.0.0.1:1/mainnet",
    );
  });
});
