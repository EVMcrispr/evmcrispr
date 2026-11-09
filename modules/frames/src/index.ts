import { defineModule } from "@evmcrispr/sdk";
import { chains, commands, configs, helpers } from "./_generated";

export default class Frames extends defineModule(
  "frames",
  commands,
  helpers,
  {},
  undefined,
  configs,
  chains,
) {
  /** How many `frames:tx` blocks are being interpreted right now. */
  depth = 0;
}

export {
  FRAME_ACCOUNT_DOMAIN_NAME,
  frameAccountTypedData,
  sendAccountFrameTransaction,
} from "./account";
