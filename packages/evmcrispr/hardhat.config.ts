import 'dotenv/config';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';

import type { HardhatUserConfig } from 'hardhat/config';

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
    timeout: 0,
  },
  networks: {
    hardhat: {
      chainId: 4,
      forking: {
        url: ARCHIVE_NODE_ENDPOINT,
        blockNumber: 10316339,
      },
    },
  },
};

export default config;
