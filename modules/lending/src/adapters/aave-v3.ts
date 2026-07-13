import { AAVE_V3_ADDRESSES_PROVIDER } from "../addresses";
import { makeAaveStyleAdapter } from "./aave-like/factory";

export default makeAaveStyleAdapter("AaveV3", AAVE_V3_ADDRESSES_PROVIDER);
