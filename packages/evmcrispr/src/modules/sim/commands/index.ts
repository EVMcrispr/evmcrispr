import type { Commands } from "../../../types";
import type { Sim } from "../Sim";
import { expect } from "./expect";
import { fork } from "./fork";
import { setBalance } from "./set-balance";
import { setCode } from "./set-code";
import { setStorageAt } from "./set-storage-at";
import { wait } from "./wait";

export const commands: Commands<Sim> = {
  fork,
  wait,
  expect,
  "set-balance": setBalance,
  "set-code": setCode,
  "set-storage-at": setStorageAt,
};
