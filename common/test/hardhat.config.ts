import type { HardhatUserConfig } from 'hardhat/config';

const FORK_CHAIN_ID = parseInt(process.env.FORK_CHAIN_ID ?? '100');

if (!FORK_CHAIN_ID) {
  throw new Error('Missing FORK_CHAIN_ID env variable');
}

export const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      chainId: FORK_CHAIN_ID,
    },
  },
};
