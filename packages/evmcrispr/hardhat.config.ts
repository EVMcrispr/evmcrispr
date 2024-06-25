import "dotenv/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import type { HardhatUserConfig } from "hardhat/types";

import { server } from "./test/fixtures/server";

const ARCHIVE_NODE_ENDPOINT = process.env.ARCHIVE_NODE_ENDPOINT;

if (!ARCHIVE_NODE_ENDPOINT) {
  throw new Error("Archive node not provided.");
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.4.24",
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  mocha: {
    reporterOptions: {
      maxDiffSize: 120000,
    },
    timeout: 0,
    rootHooks: {
      beforeAll: () => {
        server.listen({
          onUnhandledRequest: (req: Request) => {
            if (new URL(req.url).origin === "http://localhost:8545") {
              return "bypass";
            }
            return "warn";
          },
        });
      },
      afterAll: () => {
        server.close();
      },
    },
  },
  networks: {
    hardhat: {
      chains: {
        100: {
          hardforkHistory: {
            london: 34630000,
          },
        },
      },
      chainId: 100,
      hardfork: "london",
      forking: {
        url: ARCHIVE_NODE_ENDPOINT,
        blockNumber: 34630239,
      },
    },
  },
};

export default config;
