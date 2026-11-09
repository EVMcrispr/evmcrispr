import { defineModule } from "@evmcrispr/sdk";
import { chains, commands, configs, helpers } from "./_generated";
import { actions } from "./actions";

export default class Frames extends defineModule(
  "frames",
  commands,
  helpers,
  {},
  undefined,
  configs,
  chains,
) {
  /** The actions the module sends: `frames:tx`'s frame transaction. */
  static readonly actions = actions;
  /** How many `frames:tx` blocks are being interpreted right now. */
  depth = 0;
}

export {
  FRAME_ACCOUNT_DOMAIN_NAME,
  frameAccountTypedData,
  sendAccountFrameTransaction,
} from "./account";
export { frameAction } from "./actions";
export { describeFrameAction } from "./describe";
export type {
  FrameActionData,
  FrameModuleAction,
  FrameSpec,
} from "./frame-action";
