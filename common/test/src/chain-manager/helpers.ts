import type { ExecaChildProcess } from 'execa';
import { execaCommand } from 'execa';

import { HOST, LOG_FILE_NAME } from './constants';
import fs from 'fs';

export function buildChainEndpoint(port?: number | string): string {
  return `http://${HOST}${port ? `:${port}` : ''}`;
}

export function sleep(ms = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

export function createChain(
  port: number,
  forkUrl: string,
  forkBlockNumber: string,
  onData?: (data: Buffer) => void,
  onError?: (err: any) => void,
): ExecaChildProcess {
  const chainProcess = execaCommand(
    `hardhat node --port ${port} --fork ${forkUrl} --fork-block-number ${forkBlockNumber}`,
  );
  if (onData) {
    chainProcess.stdout?.addListener('data', onData);
  }
  if (onError) {
    chainProcess.stdout?.addListener('error', onError);
  }

  return chainProcess;
}

export function removeLogFile(): void {
  const path = `${process.cwd()}/${LOG_FILE_NAME}`;
  if (fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
}

export const getBasePort = (port: number, threadsLength: number): number => {
  const basePort = parseInt(port.toString().slice(1));

  /**
   * The first 100 ports are reserved to chain manager servers.
   * The rest of them are reserved to forked chains.
   */
  return basePort * threadsLength + 8100;
};
