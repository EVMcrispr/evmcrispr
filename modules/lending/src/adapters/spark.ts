import { SPARK_ADDRESSES_PROVIDER } from "../addresses";
import { makeAaveStyleAdapter } from "./aave-like/factory";

export default makeAaveStyleAdapter("Spark", SPARK_ADDRESSES_PROVIDER);
