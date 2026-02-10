import { defineHelper } from "../../../utils";
import type { Std } from "../Std";

export const me = defineHelper<Std>({
  args: [],
  async run(module) {
    return module.getConnectedAccount(true);
  },
});
