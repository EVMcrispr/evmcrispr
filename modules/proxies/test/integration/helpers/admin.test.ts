import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { GNO, TOKEN_DISTRO, TOKEN_DISTRO_PROXY_ADMIN } from "../../fixtures";

describeHelper(
  "@proxies:admin",
  {
    describeName: "Proxies > helpers > @proxies:admin(proxy)",
    module: "proxies",
    cases: [
      {
        name: "should read the ERC-1967 admin slot of a transparent proxy",
        input: `@proxies:admin(${TOKEN_DISTRO})`,
        expected: TOKEN_DISTRO_PROXY_ADMIN,
      },
    ],
    errorCases: [
      {
        name: "should fail on proxies without an admin",
        input: `@proxies:admin(${GNO})`,
        error: "has no ERC-1967 admin",
      },
    ],
  },
  helpers.admin.argDefs,
);
