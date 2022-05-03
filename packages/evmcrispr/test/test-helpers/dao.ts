import type { Contract } from '@ethersproject/contracts';

export const getEventArgument = async (
  selectedFilter: string,
  arg: string,
  contract: Contract,
  transactionHash: string,
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const filter = contract.filters[selectedFilter]();

    contract
      .queryFilter(filter)
      .then((events) => {
        const filteredEvents = events.filter(
          (event) => event.transactionHash === transactionHash,
        );
        const filteredEvent = filteredEvents[0];
        if (filteredEvent && filteredEvent.args) {
          resolve(filteredEvent.args[arg]);
        } else {
          resolve(null);
        }
      })
      .catch((err) => reject(err));
  });
};
