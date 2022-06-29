import type { providers } from 'ethers';
import { utils } from 'ethers';

import { EVMcrispr, evmcl } from '../../';
import { impersonateAddress, increase } from '../../helpers/rpc';

const CHAIN_ID = 137;

// Bee accounts
const BEE_ADDRESS_0 = '0x625236038836cecc532664915bd0399647e7826b';
const BEE_ADDRESS_1 = '0xdf8f53b9f83e611e1154402992c6f6cb7daf246c';
const BEE_ADDRESS_2 = '0x60a9372862bd752cd02d9ae482f94cd2fe92a0bf';

const RECIPIENT_ADDRESS = '0x5b0F8D8f47E3fDF7eE1c337AbCA19dBba98524e6';

const PAYMENT_REFERENCE = 'migrate 1hive funds';

const main = async () => {
  const beeSigner0 = await impersonateAddress(BEE_ADDRESS_0);

  beeSigner0.getChainId = async () => CHAIN_ID;

  const evmcrispr = await EVMcrispr.create(beeSigner0);

  const [txReceipt] = await evmcl`
    connect 1hivellc token-manager voting (
      set $recipient ${RECIPIENT_ADDRESS}
      set $reference "${PAYMENT_REFERENCE}"
      exec finance newImmediatePayment @token(DAI) $recipient @token.balance(DAI,agent:0) $reference
      exec finance newImmediatePayment @token(USDC) $recipient @token.balance(USDC,agent:0) $reference
      exec finance newImmediatePayment @token(WETH) $recipient @token.balance(WETH,agent:0) $reference
    )
  `.forward(beeSigner0);

  await processVote(txReceipt, evmcrispr);
};

const processVote = async (
  txReceipt: providers.TransactionReceipt,
  evmcrispr: EVMcrispr,
) => {
  const beeSigner1 = await impersonateAddress(BEE_ADDRESS_1);
  const beeSigner2 = await impersonateAddress(BEE_ADDRESS_2);

  const hashedStartVoteEvent = utils.id('StartVote(uint256,address,string)');
  const [startVoteLog] = txReceipt.logs.filter(
    (log) => log.topics[0] === hashedStartVoteEvent,
  );
  const voteId = startVoteLog.topics[1];

  const votingApp = (await evmcrispr.aragon.dao('1hivellc')).app('voting:0')!;
  const voteTime = await votingApp.voteTime();

  await votingApp.vote(voteId, true, true);
  await votingApp.connect(beeSigner1).vote(voteId, true, true);
  await votingApp.connect(beeSigner2).vote(voteId, true, true);

  await increase(voteTime);

  console.log('BALANCES BEFORE VOTE');
  await checkAccountBalances(RECIPIENT_ADDRESS, evmcrispr);
  await (await votingApp.executeVote(voteId)).wait();

  console.log('BALANCES AFTER VOTE');
  await checkAccountBalances(RECIPIENT_ADDRESS, evmcrispr);
};

const checkAccountBalances = async (account: string, evm: EVMcrispr) => {
  const tokenNames = ['DAI', 'USDC', 'WETH'];

  for (const token of tokenNames) {
    const balance = await evm.helpers['token.balance'](token, account)();
    console.log('----------------------------------');
    console.log(`${token}: ${Number(balance) / 1e18} (${balance.toString()})`);
    console.log('----------------------------------');
  }
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
