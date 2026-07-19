import { it } from "bun:test";
import type AragonOS from "@evmcrispr/module-aragonos";
import { MINIME_TOKEN_FACTORIES } from "@evmcrispr/module-aragonos/utils";
import { buildNonceForAddress } from "@evmcrispr/module-aragonos/utils/nonces";
import {
  BindingsSpace,
  CommandError,
  encodeAction,
  encodeCalldata,
  Num,
} from "@evmcrispr/sdk";
import {
  expect,
  getPublicClient,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { createInterpreter, describeCommand } from "@evmcrispr/test-utils/evml";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import {
  getContractAddress,
  keccak256,
  parseAbiItem,
  toHex,
  zeroAddress,
} from "viem";
import { DAO, DAO2, DAO3 } from "../../fixtures";
import { APP } from "../../fixtures/mock-app";
import {
  COMPLETE_FORWARDER_PATH,
  FEE_AMOUNT,
  FEE_FORWARDER,
  FEE_TOKEN_ADDRESS,
} from "../../fixtures/mock-forwarders";
import { server } from "../../setup";
import {
  createTestAction,
  createTestPreTxAction,
  createTestScriptEncodedAction,
  toCallScriptAction,
} from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

describeCommand("connect", {
  describeName:
    "AragonOS > commands > connect <daoNameOrAddress> <commandsBlock> > error cases",
  module: "aragonos",
  docCases: [
    {
      description: "Connect to a DAO and grant a permission",
      code: `aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (\n  aragonos:grant @me @aragonos:app(agent) TRANSFER_ROLE\n)`,
    },
  ],
  errorCases: [
    {
      name: "should fail when not passing a commands block",
      script: `load aragonos\naragonos:connect ${DAO.kernel}`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "connect")!;
        return new CommandError(c, "<block> must be a block expression");
      },
    },
    {
      name: "should fail on non-batchable commands inside the connect block",
      script: `load aragonos\naragonos:connect ${DAO.kernel} (\n  switch 1\n)`,
      error: 'command "switch" cannot be used inside connect',
    },
    {
      name: "should fail on wait inside the connect block",
      script: `load aragonos\naragonos:connect ${DAO.kernel} (\n  wait 60\n)`,
      error: 'command "wait" cannot be used inside connect',
    },
    {
      name: "should fail on chain-state-reading helpers after the connect block has collected actions",
      script: `load aragonos [act @app]\naragonos:connect ${DAO.kernel} (\n  act @app(agent) @app(agent) "transfer(address,uint256)" @me 1e18\n  act @app(agent) @app(agent) "transfer(address,uint256)" @me @gas.price\n)`,
      error: "reads on-chain state at batch-build time",
    },
    {
      name: "should fail when nesting connect commands",
      script: `load aragonos [connect]\naragonos:connect ${DAO.kernel} (\n  connect ${DAO2.kernel} (\n\n  )\n)`,
      error: (interpreter) => {
        const connectNode = findAragonOSCommandNode(
          interpreter.ast,
          "connect",
          1,
        )!;
        return new CommandError(
          connectNode,
          'nested "connect" commands are not supported; use sequential top-level connect blocks and `set $var` to share values',
        );
      },
    },
  ],
});

describeCommand("connect", {
  describeName:
    "AragonOS > commands > connect <daoNameOrAddress> <commandsBlock> > success cases",
  module: "aragonos",
  cases: [
    {
      name: "should return the correct actions when defining a complete forwarding path via forward command",
      script: `load aragonos [forward grant revoke new-token install act @app @nextApp]\naragonos:connect ${DAO3.kernel} (\n  forward ${COMPLETE_FORWARDER_PATH.map((f) => `@app(${f})`).join(" ")} (\n    grant @me @app(agent) TRANSFER_ROLE\n    grant @app(dandelion-voting.1hive) @app(token-manager) ISSUE_ROLE @app(dandelion-voting.1hive)\n    revoke @app(dandelion-voting.1hive) @app(tollgate.1hive) CHANGE_AMOUNT_ROLE true\n    new-token $token "Other Token" OT @nextApp\n    install $tm token-manager $token true 0\n    act @app(agent) @app(agent 1) "transfer(address,address,uint256)" @token(DAI) @me 10.50e18\n  )\n)`,
      validate: async (forwardingAction) => {
        const client = getPublicClient();
        const me = TEST_ACCOUNT_ADDRESS;
        const chainId = await client.getChainId();
        const { appId, codeAddress, initializeSignature } = APP;
        const tokenFactoryAddress = MINIME_TOKEN_FACTORIES.get(chainId)!;
        const newTokenAddress = getContractAddress({
          from: tokenFactoryAddress,
          nonce: await buildNonceForAddress(tokenFactoryAddress, 0, client),
        });

        const expectedForwardingActions = [
          createTestPreTxAction("approve", FEE_TOKEN_ADDRESS, [
            DAO3[FEE_FORWARDER],
            FEE_AMOUNT,
          ]),
          createTestScriptEncodedAction(
            [
              createTestAction("grantPermission", DAO3.acl, [
                me,
                DAO3.agent,
                keccak256(toHex("TRANSFER_ROLE")),
              ]),
              createTestAction("grantPermission", DAO3.acl, [
                DAO3["dandelion-voting.1hive"],
                DAO3["token-manager"],
                keccak256(toHex("ISSUE_ROLE")),
              ]),
              createTestAction("revokePermission", DAO3.acl, [
                DAO3["dandelion-voting.1hive"],
                DAO3["tollgate.1hive"],
                keccak256(toHex("CHANGE_AMOUNT_ROLE")),
              ]),
              createTestAction("removePermissionManager", DAO3.acl, [
                DAO3["tollgate.1hive"],
                keccak256(toHex("CHANGE_AMOUNT_ROLE")),
              ]),
              createTestAction(
                "createCloneToken",
                MINIME_TOKEN_FACTORIES.get(chainId)!,
                [zeroAddress, 0, "Other Token", 18, "OT", true],
              ),
              createTestAction("changeController", newTokenAddress, [
                getContractAddress({
                  from: DAO3.kernel,
                  nonce: await buildNonceForAddress(DAO3.kernel, 0, client),
                }),
              ]),
              createTestAction("newAppInstance", DAO3.kernel, [
                appId,
                codeAddress,
                encodeCalldata(
                  parseAbiItem([
                    // biome-ignore lint/style/useTemplate: template literal with interpolation breaks viem's type inference for parseAbiItem
                    `function ` + initializeSignature,
                  ]),
                  [newTokenAddress, true, "0"],
                ),
                false,
              ]),
              createTestScriptEncodedAction(
                [
                  toCallScriptAction(
                    encodeAction(
                      DAO3["agent:1"],
                      "transfer(address,address,uint256)",
                      [
                        "0x44fA8E6f47987339850636F88629646662444217",
                        me,
                        Num.fromBigInt(10500000000000000000n),
                      ],
                    ),
                  ),
                ],
                ["agent"],
                DAO3,
              ),
            ],
            COMPLETE_FORWARDER_PATH,
            DAO3,
          ),
        ];

        expect(forwardingAction).to.eqls(expectedForwardingActions);
      },
    },
    {
      name: "should resolve every fixture app inside the connect block",
      script: `load aragonos [@app]\naragonos:connect ${DAO.kernel} (\n${Object.keys(
        DAO,
      )
        .map((key, i) => {
          const [name, index] = key.split(":");
          return `  set $app${i} @app(${name}${index ? ` ${index}` : ""})`;
        })
        .join("\n")}\n)`,
      validate: async (_actions, interpreter) => {
        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        Object.entries(DAO).forEach(([appIdentifier, appAddress], i) => {
          expect(
            aragonos.bindingsManager.getBindingValue(
              `$app${i}`,
              BindingsSpace.USER,
            ),
            `${appIdentifier} binding mismatch`,
          ).to.equal(appAddress);
        });
      },
    },
    {
      name: "should share values between sequential connect blocks via set",
      script: `load aragonos [connect grant @app]\naragonos:connect ${DAO2.kernel} (\n  std:set $dv2 @app(disputable-voting.open)\n)\naragonos:connect ${DAO.kernel} (\n  grant $dv2 @app(disputable-voting.open) CREATE_VOTES_ROLE\n)`,
      validate: async (actions) => {
        const expectedActions = [
          createTestAction("grantPermission", DAO.acl, [
            DAO2["disputable-voting.open"],
            DAO["disputable-voting.open"],
            keccak256(toHex("CREATE_VOTES_ROLE")),
          ]),
        ];

        expect(actions).to.eql(expectedActions);
      },
    },
  ],
});

it("connect should keep apps connected when an implementation ABI is missing", async () => {
  server.use(
    http.get(
      "https://api.evmcrispr.com/abi/:chainId/:address",
      ({ params }: { params: { address: string } }) => {
        if (params.address.toLowerCase() === APP.codeAddress) {
          return new HttpResponse(null, { status: 404 });
        }
      },
    ),
  );

  try {
    const interpreter = createInterpreter(
      `load aragonos [@app]\naragonos:connect ${DAO3.kernel} (\n  set $addr @app(${APP.appIdentifier})\n)`,
      getPublicClient(),
    );
    await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    expect(
      aragonos.bindingsManager.getBindingValue("$addr", BindingsSpace.USER),
    ).to.equal(DAO3[APP.appIdentifier]);
  } finally {
    server.resetHandlers();
  }
});
