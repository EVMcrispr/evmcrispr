import { toDecimals } from '@1hive/evmcrispr';

export const FORWARDER = 'token-manager';
export const FEE_FORWARDER = 'tollgate.1hive';
// export const CONTEXT_FORWARDER = 'dandelion-voting.1hive';

export const COMPLETE_FORWARDER_PATH = [
  FEE_FORWARDER,
  FORWARDER,
  // CONTEXT_FORWARDER,
];

export const CONTEXT = 'Example Context: https://evmcrispr.blossom.software/';

export const FEE_AMOUNT = toDecimals(1000);
export const FEE_TOKEN_ADDRESS = '0x9556e84520978032B52b4ea6aF068d46B21252Ff';
