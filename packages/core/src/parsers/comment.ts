import {
  char,
  choice,
  endOfInput,
  everythingUntil,
  recursiveParser,
  sequenceOf,
} from "arcsecond";
import { endLine, optionalWhitespace } from "./utils";

export const commentParser = recursiveParser(() =>
  sequenceOf([
    optionalWhitespace,
    char("#"),
    everythingUntil(choice([endOfInput, endLine])),
  ]),
);
