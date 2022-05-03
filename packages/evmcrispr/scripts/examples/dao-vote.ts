import { erc20ABI } from '@1hive/connect';
import { Contract } from '@ethersproject/contracts';
import type { BigNumber } from '@ethersproject/bignumber';
import type { Signer } from '@ethersproject/abstract-signer';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import type { TransactionReceipt } from '@ethersproject/abstract-provider';

import { EVMcrispr, evmcl } from '../src/';
import { impersonateAddress, increase } from '../helpers/rpc';

const { constants } = ethers;

const CHAIN_ID = 137;

// 1hivellc.aragonid.eth
const ONE_HIVE_DAO = '0x9726f76e2993fc6d179af0ecddb297242fb437ff';

// Tokens
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

// Bee accounts
const BEE_ADDRESS_0 = '0x625236038836cecc532664915bd0399647e7826b';
const BEE_ADDRESS_1 = '0xdf8f53b9f83e611e1154402992c6f6cb7daf246c';
const BEE_ADDRESS_2 = '0x60a9372862bd752cd02d9ae482f94cd2fe92a0bf';

const RECIPIENT_ADDRESS = '0x5b0F8D8f47E3fDF7eE1c337AbCA19dBba98524e6';

const PAYMENT_REFERENCE = 'migrate_1hive_funds';

const main = async () => {
  const beeSigner0 = await impersonateAddress(BEE_ADDRESS_0);

  beeSigner0.getChainId = async () => CHAIN_ID;

  const evmcrispr = await EVMcrispr.create(ONE_HIVE_DAO, beeSigner0);

  const agentApp = evmcrispr.appCache.get('agent:0')!;
  const agent = new Contract(
    agentApp.address,
    agentApp.abiInterface,
    beeSigner0,
  );

  const daiAmount = await agent.balance(DAI);
  const usdcAmount = await agent.balance(USDC);
  const ethAmount = await agent.balance(constants.AddressZero);

  const txReceipt = await evmcrispr.forward(
    evmcl`
    exec finance newImmediatePayment ${DAI} ${RECIPIENT_ADDRESS} ${daiAmount} ${PAYMENT_REFERENCE}
    exec finance newImmediatePayment ${USDC} ${RECIPIENT_ADDRESS} ${usdcAmount} ${PAYMENT_REFERENCE}
    exec finance newImmediatePayment ETH ${RECIPIENT_ADDRESS} ${ethAmount} ${PAYMENT_REFERENCE}
  `,
    ['token-manager', 'voting'],
  );

  await processVote(txReceipt, evmcrispr);
};

const processVote = async (
  txReceipt: TransactionReceipt,
  evmcrispr: EVMcrispr,
) => {
  const beeSigner1 = await impersonateAddress(BEE_ADDRESS_1);
  const beeSigner2 = await impersonateAddress(BEE_ADDRESS_2);

  const hashedStartVoteEvent = utils.id('StartVote(uint256,address,string)');
  const [startVoteLog] = txReceipt.logs.filter(
    (log) => log.topics[0] === hashedStartVoteEvent,
  );
  const voteId = startVoteLog.topics[1];

  const votingApp = evmcrispr.appCache.get('voting:0')!;
  const votingBee0 = new Contract(
    votingApp.address,
    votingApp.abiInterface,
    evmcrispr.signer,
  );
  const votingBee1 = votingBee0.connect(beeSigner1);
  const votingBee2 = votingBee0.connect(beeSigner2);
  const voteTime = await votingBee0.voteTime();

  await votingBee0.vote(voteId, true, true);
  await votingBee1.vote(voteId, true, true);
  await votingBee2.vote(voteId, true, true);

  await increase(voteTime);

  console.log('BALANCES BEFORE VOTE');
  await checkAccountBalances(RECIPIENT_ADDRESS, beeSigner1);
  await (await votingBee0.executeVote(voteId)).wait();

  console.log('BALANCES AFTER VOTE');
  await checkAccountBalances(RECIPIENT_ADDRESS, beeSigner1);
};

const checkAccountBalances = async (account: string, signer: Signer) => {
  const tokens = [DAI, USDC, 'ETH'];
  const tokenNames = ['DAI', 'USDC', 'ETH'];

  for (let i = 0; i < tokens.length; i++) {
    let balance: BigNumber;
    if (tokens[i] !== 'ETH') {
      const token = new Contract(tokens[i], erc20ABI, signer);
      balance = await token.balanceOf(account);
    } else {
      balance = await signer.provider!.getBalance(account);
    }
    console.log('----------------------------------');
    console.log(
      `${tokenNames[i]}: ${Number(balance) / 1e18} (${balance.toString()})`,
    );
    console.log('----------------------------------');
  }
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
