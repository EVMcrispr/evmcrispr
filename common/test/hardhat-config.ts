import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';

import type { HardhatUserConfig } from 'hardhat/config';

import { server } from './src/server';

const ARCHIVE_NODE_ENDPOINT = process.env.ARCHIVE_NODE_ENDPOINT;

if (!ARCHIVE_NODE_ENDPOINT) {
  throw new Error('Archive node not provided.');
}

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  solidity: {
    compilers: [
      {
        version: '0.4.24',
      },
      {
        version: '0.7.6',
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
          onUnhandledRequest: (req) => {
            if (req.url.origin === 'http://localhost:8545/') {
              return 'bypass';
            }

            // Display warning when running on node.js environment
            console.warn(`WARNING: Unhandled request: ${req.url}`);
            return 'warn';
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
      chainId: 100,
      forking: {
        url: ARCHIVE_NODE_ENDPOINT,
        blockNumber: 24_730_000,
      },
    },
  },
};

export default config;
