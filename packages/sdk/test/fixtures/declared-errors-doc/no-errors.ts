import type { Module } from "../../../src/Module";
import { defineCommand } from "../../../src/utils/defineCommand";

export default defineCommand<Module>({
  name: "quiet",
  description: "A fixture command that declares no errors.",
  args: [],
  async run() {
    return [];
  },
});
