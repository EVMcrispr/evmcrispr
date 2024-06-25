import type { HelperFunctions } from "../../../types";
import type { Ens } from "../Ens";
import { contenthash } from "./contenthash";

export const helpers: HelperFunctions<Ens> = {
  contenthash,
};
