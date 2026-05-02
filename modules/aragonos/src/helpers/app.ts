import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type AragonOS from "..";
import { getKernel, resolveApp } from "../dao";
import { parsePrefixedDAOIdentifier } from "../utils";

export default defineHelper<AragonOS>({
  name: "app",
  description:
    "Resolve an app identifier to its proxy address within the connected DAO.",
  returnType: "address",
  args: [
    {
      name: "appIdentifier",
      type: "string",
      description: "App name, or `dao:app` for cross-DAO lookup",
    },
  ],
  async run(module, { appIdentifier }) {
    const [daoPrefix, rest] = parsePrefixedDAOIdentifier(appIdentifier);

    const dao = daoPrefix
      ? module.connectedDAOs.find(
          (d) =>
            getKernel(d).address.toLowerCase() === daoPrefix.toLowerCase() ||
            d.name === daoPrefix,
        )
      : module.currentDAO;

    if (!dao) {
      throw new ErrorException(
        daoPrefix
          ? `DAO "${daoPrefix}" not found for identifier "${appIdentifier}"`
          : '@app() must be used within a "connect" command',
      );
    }

    const app = resolveApp(dao, rest);
    if (!app) {
      throw new ErrorException(
        `app "${rest}" not found in DAO ${dao.name ?? getKernel(dao).address}`,
      );
    }

    return app.address;
  },
});
