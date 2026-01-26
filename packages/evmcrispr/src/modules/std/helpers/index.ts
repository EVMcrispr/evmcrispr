import type { HelperFunctions } from "../../../types";
import type { Std } from "../Std";
import { abiEncodeCall } from "./abi";
import { date } from "./date";
import { ens } from "./ens";
import { get } from "./get";
import { id } from "./id";
import { namehash } from "./namehash";
import { ipfs } from "./ipfs";
import { me } from "./me";
import { token, tokenAmount, tokenBalance } from "./token";

export const helpers: HelperFunctions<Std> = {
  ["abi.encodeCall"]: abiEncodeCall,
  date,
  ens,
  get,
  id,
  namehash,
  ipfs,
  me,
  token,
  ["token.balance"]: tokenBalance,
  ["token.amount"]: tokenAmount,
};
