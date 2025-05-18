import { useState } from "react";
import type { Action, TransactionAction } from "@1hive/evmcrispr";
import { EVMcrispr, isProviderAction, parseScript } from "@1hive/evmcrispr";
import type { Connector } from "wagmi";
import { useConnect, usePublicClient, useWalletClient } from "wagmi";
import type {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import { createPublicClient } from "viem";
import { HStack, VStack, useDisclosure } from "@chakra-ui/react";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";

import LogModal from "../LogModal";
import ErrorMsg from "./ErrorMsg";

import { config, transports } from "../../wagmi";

import {
  terminalStoreActions,
  useTerminalStore,
} from "../TerminalEditor/use-terminal-store";
import { ExecuteButton } from "./ExecuteButton";

type ActionButtonsType = {
  address: `0x${string}` | undefined;
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

  let publicClient: PublicClient | undefined = usePublicClient();
  const { data: walletClient } = useWalletClient();
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

  function getChainAndTransport(chainId: number) {
    const chain: Chain | undefined = config.chains.find(
      (chain) => Number(chain.id) === chainId,
    );
    if (!chain) {
      throw new Error("Chain not supported");
    }
    function isValidChainId(
      chainId: number,
    ): chainId is keyof typeof transports {
      return chainId in transports;
    }
    if (!isValidChainId(chainId)) {
      throw new Error("Transport not supported");
    }
    const transport = transports[chainId];
    return { chain, transport };
  }

  const switchOrAddChain = async (
    walletClient: WalletClient,
    chainId: number,
  ) => {
    const { chain, transport } = getChainAndTransport(chainId);
    try {
      await walletClient.switchChain({ id: chainId });
    } catch (e: unknown) {
      if ((e as Error).name === "UserRejectedRequestError") {
        throw new Error(`Switch to ${chain.name} chain rejected by user`);
      }
      if ((e as Error).name === "SwitchChainError") {
        await walletClient.addChain({ chain });
      }
      throw e;
    }
    publicClient = createPublicClient({ chain, transport });
  };

  const executeAction = async (
    action: Action,
    walletClient: WalletClient<Transport, Chain, Account>,
    maximizeGasLimit: boolean,
  ) => {
    if (isProviderAction(action)) {
      const chainId = Number(action.params[0].chainId);
      await switchOrAddChain(walletClient, chainId);
    } else {
      const chainId = await walletClient.getChainId();
      const tx = await walletClient.sendTransaction({
        chain: config.chains.find((chain) => chain.id === chainId),
        to: action.to,
        from: action.from,
        data: action.data,
        value: action.value,
        gasLimit: maximizeGasLimit ? 10_000_000n : undefined,
      });
      await publicClient?.waitForTransactionReceipt({ hash: tx });
    }
  };

  async function executeBatchedActions(
    actions: TransactionAction[],
    walletClient: WalletClient<Transport, Chain, Account>,
    maximizeGasLimit: boolean,
  ) {
    const groupedActions: TransactionAction[][] = [];
    actions.forEach((action) => {
      if (groupedActions.length == 0) {
        groupedActions.push([action]);
      } else {
        const lastGroup = groupedActions[groupedActions.length - 1];
        if (lastGroup[0].chainId === action.chainId) {
          lastGroup.push(action);
        } else {
          groupedActions.push([action]);
        }
      }
    });
    for (const group of groupedActions) {
      if (group[0].chainId !== undefined) {
        await switchOrAddChain(walletClient, group[0].chainId);
      }
      const { id } = await walletClient.sendCalls({
        chain: config.chains.find((chain) => chain.id === group[0].chainId),
        forceAtomic: true,
        calls: group.map((action) => ({
          to: action.to,
          data: action.data,
          value: BigInt(action.value || "0"),
          gasLimit: maximizeGasLimit ? 10_000_000n : undefined,
        })),
      });
      const { status } = await walletClient.waitForCallsStatus({
        id,
      });
      if (status !== "success") {
        throw new Error(
          `Transaction batch failed failed on ${config.chains.find((chain) => chain.id === group[0].chainId)?.name || "unknown chain"}`,
        );
      }
    }
  }

  async function executeSafeBatchedActions(actions: TransactionAction[]) {
    const sdk = await safeConnector
      ?.getProvider()
      .then((provider) => (provider as any).sdk);
    if (!sdk) throw new Error("Safe SDK not available");
    await (sdk as SafeAppProvider).txs.send({
      txs: actions.map((action) => ({
        to: action.to,
        data: action.data,
        value: String(action.value || "0"),
      })),
    });
  }

  async function onExecute(inBatch: boolean) {
    terminalStoreActions("errors", []);
    terminalStoreActions("isLoading", true);

    try {
      if (!address || publicClient === undefined || walletClient === undefined)
        throw new Error("Account not connected");

      const { ast, errors } = parseScript(script);

      if (errors.length) {
        terminalStoreActions("isLoading", false);
        terminalStoreActions("errors", errors);
        return;
      }

      const batched: TransactionAction[] = [];
      let chainId = Number(await walletClient.getChainId());

      await new EVMcrispr(
        ast,
        async () => publicClient!,
        async () => address,
      )
        .registerLogListener(logListener)
        .interpret(async (action: Action) => {
          if (inBatch) {
            if (isProviderAction(action)) {
              chainId = Number(action.params[0].chainId);
            } else {
              batched.push({ chainId, ...action });
            }
          } else {
            await executeAction(action, walletClient, maximizeGasLimit);
          }
        });

      if (batched.length) {
        if (safeConnector) {
          await executeSafeBatchedActions(batched);
        } else {
          await executeBatchedActions(batched, walletClient, maximizeGasLimit);
        }
      }
    } catch (err: any) {
      const e = err as Error;
      console.error(e);
      if (
        e.message.startsWith("transaction failed") &&
        /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
      ) {
        terminalStoreActions("errors", [
          `Transaction failed, watch in block explorer ${e.message.split('"')[1]}`,
        ]);
      } else {
        terminalStoreActions("errors", [e.message]);
      }
    } finally {
      terminalStoreActions("isLoading", false);
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
            <ExecuteButton isLoading={isLoading} onExecute={onExecute} />
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
