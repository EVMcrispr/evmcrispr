import { ethers } from 'hardhat';

import { Contract } from 'ethers';

import { expect } from 'chai';

import evmcl from '../src/evmcl';

import { impersonateAddress, increase } from '../helpers/rpc';
import { EVMcrispr } from '../src';

import { expectThrowAsync } from './test-helpers/expects';

const will = '0xdf456B614fE9FF1C7c0B380330Da29C96d40FB02';
const sem = '0xf632Ce27Ea72deA30d30C1A9700B6b3bCeAA05cF';

const agent = '0x9244e0426577302357d769ab52b1ba6f2f3cb2f8';
const apmDao = '0x792281c15227f16bbec04425b60c5b9b678a1c94';
const garden = '0x8ccbeab14b5ac4a431fffc39f4bec4089020a155';

describe.skip('Token Manager Upgrade', () => {
  before('Changes the permissions to the new DAO', async () => {
    const [signer] = await ethers.getSigners();

    const { actions, forward } = await evmcl`
          set $repo @aragonEns(hooked-token-manager-no-controller.open.aragonpm.eth)
          exec $repo newVersion(uint16[3],address,bytes) [2,0,0] 0x7cdB48CBF25F4f044eEaE83187E3825Ae301C93d ipfs:Qma2cVx7i9eTu9VSBexWVbfqeS1qwKc8zFFnwV4zrjTMUJ
          #  connect ${apmDao} (
          #    exec acl grantPermission ${agent} $repo @id(CREATE_VERSION_ROLE)
          #    exec acl setPermissionManager ${agent} $repo @id(CREATE_VERSION_ROLE)
          #  )
        `.encode(await impersonateAddress(will));
    console.log(actions);
    await forward();
    const { actions: actions2, forward: forward2 } = await evmcl`
          connect ${garden} disputable-voting.open --context Upgrade Token Manager (
            upgrade hooked-token-manager-no-controller.open 2.0.0
          )
        `.encode(await impersonateAddress(sem));
    console.log(actions2);
    const tx = await forward2();

    const evm = await EVMcrispr.create(signer);
    const voting = (await evm.aragon.dao(garden)).app('disputable-voting.open');

    const voteId = parseInt(tx[0].logs[2].topics[1], 16);
    const executionScript = voting.interface.decodeEventLog(
      'StartVote',
      tx[0].logs[2].data,
    ).executionScript;

    const gardenVoters = [
      '0x4ba7362F9189572CbB1216819a45aba0d0B2D1CB',
      '0xc89000E12C600b12D6e61a535cD3fedd4ac1eeC4',
      '0xdf8f53B9f83e611e1154402992c6F6CB7Daf246c',
    ];

    for (const gardenVoter of gardenVoters) {
      await voting
        .connect(await impersonateAddress(gardenVoter))
        .vote(voteId, true, { gasLimit: 10_000_000 });
    }
    await increase(evm.resolver.resolveNumber('30d'));
    await (await voting.executeVote(voteId, executionScript)).wait();
  });

  it('can wrap tokens after the upgrade', async () => {
    const gardenHolder = '0xdf8f53B9f83e611e1154402992c6F6CB7Daf246c';
    const signer = await impersonateAddress(gardenHolder);
    // const { forward } = await evmcl`
    //         connect ${brightGarden} (
    //             set $token.tokenlist https://tokens.honeyswap.org
    //             exec @token(HNY) approve(address,uint256) wrappable-hooked-token-manager.open 1
    //             exec hooked-token-manager-no-controller.open wrap 1
    //         )
    //     `.encode(signer)
    // await forward()
    const tmAddr = (
      await (await EVMcrispr.create(signer)).aragon.dao(garden)
    ).app('hooked-token-manager-no-controller.open').address;
    const tm = await new Contract(
      tmAddr,
      [
        'function implementation() external view returns(address)',
        'function isForwarder() external view returns(bool)',
        'function forward(bytes) external',
      ],
      signer,
    );
    expect(await tm.implementation()).to.be.eq(
      '0x7cdB48CBF25F4f044eEaE83187E3825Ae301C93d',
    );
    await expectThrowAsync(() => tm.isForwarder());
    await expectThrowAsync(() => tm.forward('0x00'));
  });

  xit('can upgrade the repo again from the new DAO', async () => {
    const [signer] = await ethers.getSigners();
    await evmcl`
          connect 0xa74417ac0ad7Bf32F8D37dD0C43b7A073E87190f token-manager voting (
            exec @aragonEns(hooked-token-manager-no-controller.open.aragonpm.eth) newVersion(uint16[3],address,bytes) [5,0,1] 0x7cdB48CBF25F4f044eEaE83187E3825Ae301C93d ipfs:QmdwPe5RX9XyAfSSULjjT5WSuwsVZ1wyMuVjL8Kggfdh4b
          )
        `.forward(await impersonateAddress(sem));

    const evm = await EVMcrispr.create(signer);
    const voting = (await evm.aragon.dao('apm')).app('disputable-voting.open');

    await voting.connect(await impersonateAddress(sem)).vote('0', true);
    await voting.connect(await impersonateAddress(will)).vote('0', true);
  });
});
