import { describe, expect, it } from "bun:test";
import { chains } from "../../modules/frames/src/chains";
import {
  devAccounts,
  extendGenesis,
  FUNDED_BALANCE,
  failureMessage,
  kurtosisConfig,
  MINING_CHAIN,
  QUICK_CHAIN,
} from "../frame-devnet-config";

const OTHER = "0x00000000219ab540356cbb839cbe05303d7705fa";
const fixture = (prefixed: boolean) => ({
  config: { chainId: 9 },
  alloc: {
    [prefixed ? OTHER : OTHER.slice(2)]: {
      code: "0x",
      storage: {},
      balance: "0x1",
      nonce: "0x0",
    },
  },
});

describe("frame devnet config", () => {
  it("derives anvil's accounts in index order", () => {
    const accounts = devAccounts();
    expect(accounts).toHaveLength(10);
    // Anvil's #0 and #1: the cross-check; the rest is derived the same way.
    expect(accounts[0]!.address).toBe(
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    );
    expect(accounts[1]!.address).toBe(
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    );
  });

  it("extends a genesis, keeping every existing entry", () => {
    const addresses = devAccounts().map((a) => a.address);
    for (const prefixed of [true, false]) {
      const original = fixture(prefixed);
      const extended = extendGenesis(
        structuredClone(original),
        addresses,
        FUNDED_BALANCE,
        81411,
      );
      // Only the chain id changes in the config.
      expect(extended.config).toEqual({ ...original.config, chainId: 81411 });
      const key = prefixed ? OTHER : OTHER.slice(2);
      expect(extended.alloc[key]).toEqual(original.alloc[key]);
      expect(Object.keys(extended.alloc)).toHaveLength(11);
      for (const address of addresses) {
        const lower = address.toLowerCase();
        const written = prefixed ? lower : lower.slice(2);
        expect(extended.alloc[written]?.balance).toBe("0xd3c21bcecceda1000000");
      }
    }
  });

  it("refuses to change the balance of an account already funded", () => {
    const [first] = devAccounts();
    const genesis = {
      config: { chainId: 9 },
      alloc: { [first!.address.toLowerCase()]: { balance: "0x5" } },
    };
    expect(() =>
      extendGenesis(genesis, [first!.address], FUNDED_BALANCE, 81411),
    ).toThrow(/already funded with a different balance/);
  });

  it("writes the mining devnet's config", () => {
    const addresses = devAccounts().map((a) => a.address);
    const config = kurtosisConfig(addresses) as {
      participants: { el_image: string; cl_image: string }[];
      network_params: {
        heze_fork_epoch: number;
        prefunded_accounts: string;
        network_id: string;
      };
    };
    expect(config.network_params.network_id).toBe("81412");
    expect(config.network_params.heze_fork_epoch).toBe(2);
    expect(config.participants[0]!.el_image).toBe("ethrex:local");
    expect(config.participants[0]!.cl_image).toBe(
      "ethpandaops/lighthouse:focil",
    );
    const funded = JSON.parse(config.network_params.prefunded_accounts);
    expect(Object.keys(funded)).toEqual(addresses);
    for (const a of addresses)
      expect(funded[a]).toEqual({ balance: "1000000ETH" });
  });

  it("takes the devnets from the frames module's chains", () => {
    expect(QUICK_CHAIN).toEqual(chains.find((c) => c.key === "framesQuick")!);
    expect(MINING_CHAIN).toEqual(chains.find((c) => c.key === "framesMining")!);
    expect(QUICK_CHAIN.id).toBe(81411);
    expect(MINING_CHAIN.id).toBe(81412);
    expect(QUICK_CHAIN.rpcUrl).toBe("http://127.0.0.1:8570");
    expect(MINING_CHAIN.rpcUrl).toBe("http://127.0.0.1:32003");
  });

  it("says why a command failed, with what it printed", () => {
    // Bun's ShellError: the message is only the exit code; stderr holds why.
    const shell = Object.assign(new Error("Failed with exit code 125"), {
      exitCode: 125,
      stderr: Buffer.from(
        "docker: Error response from daemon: port is already allocated.\n",
      ),
    });
    expect(failureMessage(shell)).toBe(
      "Failed with exit code 125: docker: Error response from daemon: port is already allocated.",
    );
    expect(failureMessage(new Error("plain"))).toBe("plain");
    expect(failureMessage("text")).toBe("text");
  });
});
