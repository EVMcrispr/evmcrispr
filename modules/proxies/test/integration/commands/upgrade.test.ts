import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  GNO,
  SOME_ADDRESS,
  TOKEN_DISTRO,
  TOKEN_DISTRO_PROXY_ADMIN,
} from "../../fixtures";

const initData = encodeAction(GNO, "initializeV2(uint256)", [Num(42n)]).data!;

describeCommand("upgrade", {
  describeName:
    "Proxies > commands > upgrade <proxy> to <implementation> [signature] [params]",
  module: "proxies",
  preamble: "load proxies",
  cases: [
    {
      name: "should upgrade UUPS-style proxies through the proxy itself",
      script: `proxies:upgrade ${GNO} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(GNO, "upgradeToAndCall(address,bytes)", [
          SOME_ADDRESS,
          "0x",
        ]),
      ],
    },
    {
      name: "should upgrade transparent proxies through their ProxyAdmin",
      script: `proxies:upgrade ${TOKEN_DISTRO} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(
          TOKEN_DISTRO_PROXY_ADMIN,
          "upgradeAndCall(address,address,bytes)",
          [TOKEN_DISTRO, SOME_ADDRESS, "0x"],
        ),
      ],
    },
    {
      name: "should encode an initializer call after the upgrade",
      script: `proxies:upgrade ${GNO} to ${SOME_ADDRESS} initializeV2(uint256) 42`,
      expectedActions: [
        encodeAction(GNO, "upgradeToAndCall(address,bytes)", [
          SOME_ADDRESS,
          initData,
        ]),
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail on non-proxy addresses",
      script: `proxies:upgrade ${SOME_ADDRESS} to ${GNO}`,
      error: "is not an ERC-1967 proxy",
    },
  ],
});

describeCommand("upgrade-beacon", {
  describeName:
    "Proxies > commands > upgrade-beacon <beacon> to <implementation>",
  module: "proxies",
  preamble: "load proxies",
  cases: [
    {
      name: "should encode an upgradeTo action on the beacon",
      script: `proxies:upgrade-beacon ${GNO} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(GNO, "upgradeTo(address)", [SOME_ADDRESS]),
      ],
    },
  ],
});
