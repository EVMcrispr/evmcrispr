export type SuperfluidBatchAction = {
  to: string;
  data: string;
  sfBatchType: CallCode;
};

export enum CallCode {
  ERC20_APPROVE = 1,
  ERC20_TRANSFER_FROM = 2,
  ERC777_SEND = 3,
  SUPERTOKEN_UPGRADE = 101,
  SUPERTOKEN_DOWNGRADE = 102,
  SUPERFLUID_CALL_AGREEMENT = 201,
  CALL_APP_ACTION = 202,
}
