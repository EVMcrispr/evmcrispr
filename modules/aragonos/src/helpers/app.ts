import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type AragonOS from "..";
import { countApps, getKernel, resolveApp } from "../dao";

export default defineHelper<AragonOS>({
  name: "app",
  description:
    "Resolve an app name to its proxy address within the connected DAO.",
  returnType: "address",
  args: [
    {
      name: "appName",
      type: "string",
      description: "App name (e.g. `vault`, `voting.open`)",
    },
    {
      name: "index",
      type: "number",
      optional: true,
      description: "Instance index when multiple apps share a name (0 = first)",
    },
  ],
  async run(module, { appName, index: rawIndex }) {
    const dao = module.currentDAO;

    if (!dao) {
      throw new ErrorException(
        '@app() must be used within a "connect" command',
      );
    }

    const index = rawIndex === undefined ? 0 : Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) {
      throw new ErrorException(
        `@app() index must be a non-negative integer, got ${rawIndex}`,
      );
    }

    const app = resolveApp(dao, appName, index);
    if (!app) {
      const daoLabel = dao.name ?? getKernel(dao).address;
      const count = countApps(dao, appName);

      if (count === 0) {
        throw new ErrorException(
          `app "${appName}" not found in DAO ${daoLabel}`,
        );
      }

      throw new ErrorException(
        `app "${appName}" has only ${count} instance(s) in DAO ${daoLabel} (requested index ${index})`,
      );
    }

    return app.address;
  },
});
