import { useState } from "react";
import type { Action, TransactionAction } from "@1hive/evmcrispr";
import { EVMcrispr, isProviderAction, parseScript } from "@1hive/evmcrispr";
import type { Connector } from "wagmi";
import { useConnect, useWalletClient } from "wagmi";
import type { Account, Chain, Transport, WalletClient } from "viem";
import { HStack, VStack, useDisclosure } from "@chakra-ui/react";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";

import LogModal from "../LogModal";
import ErrorMsg from "./ErrorMsg";

import { config } from "../../wagmi";

import {
  terminalStoreActions,
  useTerminalStore,
} from "../TerminalEditor/use-terminal-store";
import { clientToSigner } from "../../utils/ethers";
import { ExecuteButton } from "./ExecuteButton";

type ActionButtonsType = {
  address: string;
  maximizeGasLimit: boolean;
};

export default function ActionButtons({
  address,
  maximizeGasLimit,
}: ActionButtonsType) {
  const [logs, setLogs] = useState<string[]>([]);

  const { errors, isLoading, script } = useTerminalStore();

  const {
    isOpen: isLogModalOpen,
    onOpen: onLogModalOpen,
    onClose: _onLogModalClose,
  } = useDisclosure({
    id: "log",
  });

  const { data: client, refetch } = useWalletClient();
  const { connectors } = useConnect();
  const safeConnector = connectors.find((c: Connector) => c.id === "safe");

  function logListener(message: string, prevMessages: string[]) {
    if (!isLogModalOpen) {
      onLogModalOpen();
    }
    console.log(message);
    setLogs([...prevMessages, message]);
  }

  function onLogModalClose() {
    _onLogModalClose();
    setLogs([]);
  }

  const executeAction = async (
    action: Action,
    client: WalletClient<Transport, Chain, Account>,
    maximizeGasLimit: boolean,
  ) => {
    if (isProviderAction(action)) {
      const [chainParam] = action.params;
      await client.switchChain({ id: Number(chainParam.chainId) });
      const { data: refetchedClient } = await refetch();
      if (!refetchedClient) {
        throw new Error("Failed to refetch client after chain switch");
      }
      return refetchedClient;
    } else {
      const chainId = await client.getChainId();
      await client.sendTransaction({
        chain: config.chains.find((chain) => chain.id === chainId),
        to: action.to as `0x${string}`,
        from: action.from as `0x${string}`,
        data: action.data as `0x${string}`,
        value: BigInt(action.value || 0),
        gasLimit: maximizeGasLimit ? 10_000_000n : undefined,
      });
      return client;
    }
  };

  async function onExecute(inBatch: boolean) {
    terminalStoreActions.errors([]);
    terminalStoreActions.isLoading(true);

    try {
      if (client === undefined) throw new Error("Account not connected");

      const { ast, errors } = parseScript(script);

      if (errors.length) {
        terminalStoreActions.isLoading(false);
        terminalStoreActions.errors(errors);
        return;
      }

      const batched: TransactionAction[] = [];
      const getSigner = async () => {
        const { data: client } = await refetch();
        return clientToSigner(client!);
      };
      await new EVMcrispr(ast, getSigner)
        .registerLogListener(logListener)
        .interpret(async (action) => {
          if (inBatch) {
            if (isProviderAction(action)) {
              throw new Error("Batching not supported for provider actions");
            }
            batched.push(action);
          } else {
            await executeAction(action, client, maximizeGasLimit);
          }
        });

      if (batched.length) {
        const sdk = await safeConnector
          ?.getProvider()
          .then((provider) => (provider as any).sdk);
        if (!sdk) throw new Error("Safe SDK not available");
        await (sdk as SafeAppProvider).txs.send({
          txs: batched.map((action) => ({
            to: action.to,
            data: action.data,
            value: String(action.value || "0"),
          })),
        });
      }
    } catch (err: any) {
      const e = err as Error;
      console.error(e);
      if (
        e.message.startsWith("transaction failed") &&
        /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
      ) {
        terminalStoreActions.errors([
          `Transaction failed, watch in block explorer ${
            e.message.split('"')[1]
          }`,
        ]);
      } else {
        terminalStoreActions.errors([e.message]);
      }
    } finally {
      terminalStoreActions.isLoading(false);
    }
  }

  return (
    <>
      <HStack mt={3} justify="flex-end">
        <VStack
          alignItems="flex-end"
          spacing={3}
          height="60px"
          pr={{ base: 6, lg: 0 }}
        >
          {address ? (
            <ExecuteButton
              isLoading={isLoading}
              onExecute={onExecute}
              allowBatch={!!safeConnector}
            />
          ) : null}
          {errors ? <ErrorMsg errors={errors} /> : null}
        </VStack>
      </HStack>
      <LogModal
        isOpen={isLogModalOpen}
        logs={logs}
        closeModal={onLogModalClose}
      />
    </>
  );
}
