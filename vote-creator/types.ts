import { BigNumber } from "@ethersproject/bignumber";

export interface CallScriptAction {
  to: string;
  data: string;
  value?: BigNumber;
}

export interface Permission {
  appAddress: string;
  role: string;
  granteeAddress: string;
  managerAddress: string;
}
