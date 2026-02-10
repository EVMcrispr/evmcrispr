export const moduleRegistry = {
  aragonos: () => import("./aragonos"),
  sim: () => import("./sim"),
  giveth: () => import("./giveth"),
  ens: () => import("./ens"),
} as const;

export const moduleNames = Object.keys(moduleRegistry) as string[];
