import command from "./propose";

export default {
  ...command,
  smartSupport: {
    kind: "incompatible" as const,
    reason:
      "Safe workflows open their own atomic context; they cannot be nested.",
  },
  description:
    "Propose a Safe smart batch with explicit on-chain expressions and typed return capture.",
  createsSmartBatchContext: true,
};
