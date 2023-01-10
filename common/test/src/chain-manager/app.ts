import { providers } from 'ethers';
import type { ErrorRequestHandler } from 'express';
import express from 'express';
import isPortReachable from 'is-port-reachable';

import { CHAIN_CREATION_TIMEOUT_MS, HOST } from './constants';
import {
  buildChainEndpoint,
  createChain,
  getBasePort,
  removeLogFile,
  sleep,
} from './helpers';
import { logger } from './logger';
import type {
  ChainData as ChainProcessData,
  ChainResponseBody,
  ErrorResponseBody,
} from './types';
import type { Server } from 'http';
import { StringDecoder } from 'string_decoder';

const ARCHIVE_NODE_ENDPOINT = process.env.ARCHIVE_NODE_ENDPOINT;
const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER;
// eslint-disable-next-line turbo/no-undeclared-env-vars
const LOG_CHAINS = Boolean(process.env.LOG_CHAINS);
// eslint-disable-next-line turbo/no-undeclared-env-vars
const WORKERS_LENGTH = parseInt(process.env.WORKERS_LENGTH ?? '8');

let currentPort: number;

if (!ARCHIVE_NODE_ENDPOINT) {
  throw new Error('Missing ARCHIVE_NODE_ENDPOINT');
}

if (!FORK_BLOCK_NUMBER) {
  throw new Error('Missing FORK_BLOCK_NUMBER');
}

const app = express();
let server: Server | undefined;

const CHAIN_PROCESSES: Record<string, ChainProcessData> = {};
const decoder = new StringDecoder('utf-8');

app.get<string, unknown, ChainResponseBody>(
  '/chain',
  async (req, res, next) => {
    const workerIndex = parseInt((req.query['index'] as string) ?? '1');

    const chainPort = getBasePort(currentPort, WORKERS_LENGTH) + workerIndex;
    const chainEndpoint = buildChainEndpoint(chainPort);

    if (!CHAIN_PROCESSES[workerIndex]) {
      const portInUsed = await isPortReachable(chainPort, {
        host: HOST,
      });

      if (portInUsed) {
        next(
          new Error(
            `/chain - Couldn't create worker chain ${workerIndex} on port ${chainPort} as it's  already in used`,
          ),
        );
        return;
      }

      try {
        let isReady = false;
        let error;

        logger.info(
          `/chain - Creating chain with id ${workerIndex} on port ${chainPort}…`,
        );

        const chainProcess = createChain(
          chainPort,
          ARCHIVE_NODE_ENDPOINT,
          FORK_BLOCK_NUMBER,
          (data) => {
            if (LOG_CHAINS) {
              logger.verbose(
                `(id: ${workerIndex}, port ${chainPort}) ${decoder.write(
                  data,
                )}`,
              );
            }
            isReady = true;
          },
          (err) => {
            if (LOG_CHAINS) {
              logger.error(`(id: ${workerIndex}, port ${chainPort}) ${err}`);
            }
            isReady = true;
            error = err;
          },
        );

        // Wait until the chain subprocess is ready or timeout triggers
        await Promise.race([
          (async function () {
            while (!isReady) {
              await sleep();
            }
          })(),
          new Promise((_, reject) =>
            setTimeout(() => reject(), CHAIN_CREATION_TIMEOUT_MS),
          ),
        ]);

        if (error) {
          next(error);
          return;
        }

        logger.info(
          `/chain - Worker chain ${workerIndex} on port ${chainPort} ready!`,
        );

        const provider = new providers.JsonRpcProvider(chainEndpoint);

        const snapshotId = (await provider.send('evm_snapshot', [])) as string;

        CHAIN_PROCESSES[workerIndex] = {
          process: chainProcess,
          port: chainPort,
          snapshot: snapshotId,
          provider,
        };
      } catch (err) {
        next(
          new Error(
            `/chain - An error occured while creating worker chain ${workerIndex} ${
              err ? `:${err}` : ''
            }`,
          ),
        );
        return;
      }
    }

    res.status(200).json({ endpoint: chainEndpoint });
  },
);

app.get('/reset', async (req, res, next) => {
  const workerIndex = parseInt((req.query['index'] as string) ?? '1');
  const chain = CHAIN_PROCESSES[workerIndex];

  if (!chain) {
    next(new Error(`/reset - Worker chain ${workerIndex} not found`));
    return;
  }

  const { provider, snapshot } = CHAIN_PROCESSES[workerIndex];

  try {
    await provider.send('evm_revert', [snapshot]);
    const snapshotId = await provider.send('evm_snapshot', []);
    CHAIN_PROCESSES[workerIndex].snapshot = snapshotId;

    res.sendStatus(200);
  } catch (err) {
    const err_ = err as Error;
    next(
      new Error(
        `/reset - An error occurred while resetting worker chain ${workerIndex}: ${err_.message}`,
      ),
    );
  }
});

const errorHandler: ErrorRequestHandler<unknown, ErrorResponseBody> = function (
  error,
  _req,
  res,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next,
) {
  const [, message] = error.message.split('-');
  logger.error(error.message);
  res.status(500).json({ message: message.trim() });
};

app.use(errorHandler);

export async function runServer(port: number): Promise<void> {
  removeLogFile();

  currentPort = port;

  const isServerRunning = await isPortReachable(port, {
    host: HOST,
  });

  if (isServerRunning) {
    throw new Error(
      `Can't run chain manager as port ${port} is already in used`,
    );
  }

  server = app.listen(port, () => {
    logger.info(`Chain manager listening on port ${port}`);
  });
}

export async function closeServer(): Promise<void> {
  logger.info('Closing chain manager server');

  if (!server) {
    throw new Error(
      `Error when closing chain manager. Can't found server on port ${currentPort}`,
    );
  }

  Object.keys(CHAIN_PROCESSES)
    .map((key) => CHAIN_PROCESSES[key])
    .forEach(({ process }) => process.kill());
  server.close();
}
