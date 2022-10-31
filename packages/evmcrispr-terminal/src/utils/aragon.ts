export const client = (chainId: number | undefined): string | undefined => {
  switch (chainId) {
    case 4:
      return 'rinkeby.client.aragon.org';
    case 100:
      return 'aragon.1hive.org';
    default:
      return 'client.aragon.org';
  }
};
