import { toDecimals } from '../../src/helpers';

export const FORWARDER = 'token-manager';
export const FEE_FORWARDER = 'tollgate.open';
export const CONTEXT_FORWARDER = 'disputable-voting.open';

export const COMPLETE_FORWARDER_PATH = [
  FEE_FORWARDER,
  FORWARDER,
  CONTEXT_FORWARDER,
];

export const CONTEXT =
  'Example Context: https://evm-crispr.blossom.software/#terminal/';

export const FEE_AMOUNT = toDecimals(1);
export const FEE_TOKEN_ADDRESS = '0x0527E400502d0CB4f214dd0D2F2a323fc88Ff924';
