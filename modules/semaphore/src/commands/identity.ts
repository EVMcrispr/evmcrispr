import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  Num,
} from "@evmcrispr/sdk";
import type Semaphore from "..";
import { deriveIdentity, IDENTITY_MESSAGE } from "../utils/identity";

export default defineCommand<Semaphore>({
  name: "identity",
  description:
    "Derive a Semaphore v4 identity and bind its public commitment to <variable>. The connected wallet signs a fixed message and the signature seeds the identity - deterministic per wallet, recoverable anywhere by re-signing. The secret never leaves module memory.",
  batchable: false,
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the identity commitment to",
    },
  ],
  async run(module, { variable }, { interpreters }) {
    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "semaphore:identity requires an execution context with wallet access",
      );
    }
    const account = await module.getConnectedAccount(true);
    module.context.log("semaphore: sign the identity message in your wallet…");
    const seed = (await actionCallback({
      type: "wallet",
      method: "personal_sign",
      params: [IDENTITY_MESSAGE, account],
    })) as string;
    if (typeof seed !== "string" || !seed.startsWith("0x")) {
      throw new ErrorException(
        "semaphore:identity: the wallet did not return a signature",
      );
    }
    const identity = await deriveIdentity(seed);
    module.storeIdentity(identity);
    module.bindingsManager.setBinding(
      variable,
      Num.fromBigInt(identity.commitment),
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    module.context.log(
      `:success: semaphore: identity ready (commitment ${identity.commitment})`,
    );
    return [];
  },
});
