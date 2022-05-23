import { utils } from 'ethers';

import { DAO } from '.';
import { toDecimals } from '../../src/utils';

export const APP = {
  appName: 'token-manager.aragonpm.eth',
  codeAddress: '0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6',
  initializeSignature: 'initialize(address,bool,uint256)',
  initializeParams: [
    '0x1c06257469514574c0868fdcb83c5509b5513870',
    false,
    toDecimals(1000),
  ],
  initializeUnresolvedParams: ['vault', false, '1000e18'],
  callSignature: 'mint(address,uint256)',
  callSignatureParams: [DAO.voting, toDecimals(15)],
  callSignatureUnresolvedParams: ['voting', '15e18'],
  actTarget: '0xc778417e063141139fce010982780140aa0cd5ab',
  actSignature: 'approve(address[],uint256[][2],bool,bytes,bytes32)',
  actSignatureParams: [
    ['0x1c06257469514574c0868fdcb83c5509b5513870'],
    [
      [toDecimals(1000), 56],
      [String(0.15e8), 4838400],
    ],
    false,
    utils.hexlify(utils.toUtf8Bytes('hello')),
    utils.formatBytes32String('hello'),
  ],
  actSignatureUnresolvedParams: [
    ['vault'],
    [
      ['1000e18', 56],
      ['0.15e8', '56d'],
    ],
    'false',
    'hello',
    'hello',
  ], // TODO: Change it with an Agent
  get appIdentifier(): keyof typeof DAO {
    return this.appName.split('.')[0] as keyof typeof DAO;
  },
  get appId(): string {
    return utils.namehash(this.appName);
  },
};
