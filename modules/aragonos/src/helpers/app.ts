import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type AragonOS from "..";
import { parsePrefixedDAOIdentifier } from "../utils";

export default defineHelper<AragonOS>({
  name: "app",
  returnType: "address",
  args: [{ name: "appIdentifier", type: "string" }],
  async run(module, { appIdentifier }) {
    const [daoPrefix, rest] = parsePrefixedDAOIdentifier(appIdentifier);

    const dao = daoPrefix
      ? module.connectedDAOs.find(
          (d) =>
            d.kernel.address.toLowerCase() === daoPrefix.toLowerCase() ||
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

    const app = dao.resolveApp(rest);
    if (!app) {
      throw new ErrorException(
        `app "${rest}" not found in DAO ${dao.name ?? dao.kernel.address}`,
      );
    }

    return app.address;
  },
});
