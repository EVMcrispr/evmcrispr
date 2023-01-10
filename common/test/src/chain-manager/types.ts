import type { providers } from 'ethers';
import type { ExecaChildProcess } from 'execa';

export type ServerRunOptions = {
  throwIfPortInUsed?: boolean;
  port: number;
};

export type ChainResponseBody = {
  endpoint: string;
};

export type ErrorResponseBody = {
  message: string;
};

export type ChainData = {
  process: ExecaChildProcess;
  port: number;
  snapshot: string;
  provider: providers.JsonRpcProvider;
};
