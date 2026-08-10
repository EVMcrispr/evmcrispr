import { beforeEach, describe, it } from "bun:test";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { gnosis } from "viem/chains";
import { anvilUrl } from "../../../../../scripts/anvil-config";
import { server } from "../../setup";

const ANVIL_RPC = anvilUrl();
const AUTH = "someuser/someproject/somekey";

const vnetRequests: any[] = [];
const environmentRequests: any[] = [];

server.use(
  http.post(
    "https://api.tenderly.co/api/v1/account/:user/project/:project/vnets",
    async ({ request }) => {
      const body = (await request.json()) as any;
      vnetRequests.push(body);
      return HttpResponse.json({
        id: `vnet-${vnetRequests.length}`,
        rpcs: [{ name: "Admin RPC", url: ANVIL_RPC }],
      });
    },
  ),
  http.post(
    "https://api.tenderly.co/api/public/v1/account/:user/project/:project/environments",
    async ({ request }) => {
      const body = (await request.json()) as any;
      environmentRequests.push(body);
      return HttpResponse.json({
        id: "env-1",
        active_instance: {
          vnets: body.network_configs.map((config: any) => ({
            network_id: config.network_id,
            rpcs: [
              { name: "Admin RPC", url: ANVIL_RPC },
              { name: "Public RPC", url: ANVIL_RPC },
            ],
          })),
        },
      });
    },
  ),
);

function createRunner() {
  const logs: string[] = [];
  const evm = new Interpreter(evml.registry, {
    account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    transports: getTransports(),
    onLog: (message: string) => logs.push(message),
  });
  evm.switchChainId(gnosis.id);
  return { evm, logs };
}

describe("Sim > commands > fork > tenderly multichain", () => {
  beforeEach(() => {
    vnetRequests.length = 0;
    environmentRequests.length = 0;
  });

  it("creates ONE multichain environment with every literal switch target attached", async () => {
    const { evm, logs } = createRunner();
    await evm.interpret(`load sim
sim:fork --using tenderly-multichain --auth-token ${AUTH} (
  switch 1
  switch 100
)`);

    expect(environmentRequests).to.have.length(1);
    expect(vnetRequests).to.have.length(0);
    const networkIds = environmentRequests[0].network_configs.map(
      (c: any) => c.network_id,
    );
    expect(networkIds).to.eql(["100", "1"]);
    expect(
      logs.some((l) =>
        l.includes(
          "https://dashboard.tenderly.co/someuser/someproject/environments/env-1",
        ),
      ),
    ).to.be.true;
  });

  it("creates one Virtual TestNet per chain in plain tenderly mode", async () => {
    const { evm } = createRunner();
    await evm.interpret(`load sim
sim:fork --using tenderly --auth-token ${AUTH} (
  switch 1
)`);

    expect(environmentRequests).to.have.length(0);
    expect(vnetRequests).to.have.length(2);
    expect(vnetRequests[0].fork_config.network_id).to.eq(100);
    expect(vnetRequests[1].fork_config.network_id).to.eq(1);
  });

  it("rejects switching to a chain that was not attached at creation", async () => {
    const { evm } = createRunner();
    let error: Error | undefined;
    try {
      // 10 (optimism) never appears as a literal switch target — the `set`
      // indirection hides it from the static scan.
      await evm.interpret(`load sim
set $target 10
sim:fork --using tenderly-multichain --auth-token ${AUTH} (
  switch $target
)`);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include(
      "not part of the multichain Virtual Environment",
    );
  });
});
