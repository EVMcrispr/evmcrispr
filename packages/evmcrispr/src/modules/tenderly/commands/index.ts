import type { Commands } from "../../../types";
import type { Tenderly } from "../Tenderly";

import { fork } from "./fork";
import { wait } from "./wait";
import { expect } from "./expect";

export const commands: Commands<Tenderly> = {
  fork,
  wait,
  expect,
};
