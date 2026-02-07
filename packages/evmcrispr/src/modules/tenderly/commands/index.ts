import type { Commands } from "../../../types";
import type { Tenderly } from "../Tenderly";
import { expect } from "./expect";
import { fork } from "./fork";
import { wait } from "./wait";

export const commands: Commands<Tenderly> = {
  fork,
  wait,
  expect,
};
