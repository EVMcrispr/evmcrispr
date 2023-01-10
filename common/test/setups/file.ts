import type { Wallet } from 'ethers';
import 'isomorphic-fetch';
import type { setupServer } from 'msw/lib/node';

import { buildChainEndpoint } from '../src/chain-manager/helpers';
import { getWallets } from '../src/ethers';
import { setUpServer as setUpServer_ } from '../src/server';

// eslint-disable-next-line turbo/no-undeclared-env-vars
const WORKER_ID = process.env.VITEST_POOL_ID;

declare module 'vitest' {
  export interface Suite {
    utils: {
      getWallets(): Promise<Wallet[]>;
    };
  }
}

export type SetupOptions = {
  customServerHandlers?: Parameters<typeof setupServer>;
  chainManagerPort: number;
};

export function runSetup({
  customServerHandlers = [],
  chainManagerPort,
}: SetupOptions): void {
  const server = setUpServer_(customServerHandlers);
  const chainManagerEndpoint = buildChainEndpoint(chainManagerPort);

  beforeAll((ctx) => {
    ctx.utils = {
      getWallets() {
        return getWallets(chainManagerPort);
      },
    };

    server.listen({
      onUnhandledRequest: (req) => {
        if (req.url.hostname === 'localhost') {
          return 'bypass';
        }

        // Display warning when running on node.js environment
        console.warn(`WARNING: Unhandled request: ${req.url}`);
        return 'warn';
      },
    });
  });

  beforeEach(() => {
    server.resetHandlers();
  });

  afterAll(async () => {
    server.close();

    const response = await fetch(
      `${chainManagerEndpoint}/reset?index=${WORKER_ID}`,
    );

    if (response.status !== 200) {
      const data = await response.json();
      throw new Error(
        `An error occured while resetting chain: ${data.message}`,
      );
    }
  });
}
