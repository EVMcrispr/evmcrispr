import { everyCharUntil } from "@evmcrispr/sdk";
import {
  char,
  choice,
  endOfInput,
  recursiveParser,
  sequenceOf,
} from "arcsecond";
import { endLine, optionalWhitespace } from "./utils";

export const commentParser = recursiveParser(() =>
  sequenceOf([
    optionalWhitespace,
    char("#"),
    everyCharUntil(choice([endOfInput, endLine])),
  ]),
);
