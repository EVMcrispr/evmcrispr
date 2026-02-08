import type { Commands } from "../../../types";
import type { Sim } from "../Sim";
import { expect } from "./expect";
import { fork } from "./fork";
import { wait } from "./wait";

export const commands: Commands<Sim> = {
  fork,
  wait,
  expect,
};
