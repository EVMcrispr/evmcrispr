import type { Commands } from "../../../types";
import type { Std } from "../Std";

import { batch } from "./batch";
import { exec } from "./exec";
import { _for } from "./for";
import { halt } from "./halt";
import { load } from "./load";
import { print } from "./print";
import { raw } from "./raw";
import { set } from "./set";
import { sign } from "./sign";
import { _switch } from "./switch";

export const commands: Commands<Std> = {
  batch,
  exec,
  halt,
  load,
  set,
  sign,
  switch: _switch,
  raw,
  print,
  for: _for,
};
