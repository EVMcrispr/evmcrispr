import type { providers } from 'ethers';
import { BigNumber, Contract } from 'ethers';

import { ErrorException } from '../../..';
import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';
import { CFAv1, CFAv1Forwarder, host } from '../addresses';

import type { Superfluid } from '../Superfluid';
import type { SuperfluidBatchAction } from '../types';
import { CallCode } from '../types';

async function getContractValue(
  provider: providers.Provider,
  target: string,
  signatureReturns: string,
  params: any[],
) {
  const [signature, returns] = signatureReturns.split(':');
  const contract = new Contract(
    target,
    [`function ${signature} public view returns ${returns}`],
    provider,
  );
  console.log(await contract[signature](...params));
  return contract[signature](...params);
}

export const setFlow: ICommand<Superfluid> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 3 });

    const [token, receiver, flowRate] = await interpretNodes(c.args);
    const sender = await module.getConnectedAccount();

    const _host = host.get(String(await module.getChainId()));
    const _cfaV1 = CFAv1.get(String(await module.getChainId()));
    const _cfaV1Forwarder = CFAv1Forwarder.get(
      String(await module.getChainId()),
    );
    if (!_host || !_cfaV1 || !_cfaV1Forwarder) {
      throw new ErrorException('Network not supported');
    }

    const encode = (signature: string): SuperfluidBatchAction[] => {
      const params = !signature.startsWith('delete')
        ? [token, receiver, flowRate, '0x']
        : [token, sender, receiver, '0x'];

      return [
        {
          ...encodeAction(_host, 'callAgreement(address,bytes,bytes)', [
            _cfaV1,
            encodeAction(_cfaV1, signature, params).data,
            '0x',
          ]),
          sfBatchType: CallCode.SUPERFLUID_CALL_AGREEMENT,
        },
      ];
    };

    const prevFlowRateBN = (await getContractValue(
      await module.getProvider(),
      _cfaV1Forwarder,
      'getFlowrate(address,address,address):(int96)',
      [token, sender, receiver],
    )) as BigNumber;

    console.log(prevFlowRateBN);

    const flowRateBN = BigNumber.from(flowRate);

    if (flowRateBN.gt(0)) {
      if (prevFlowRateBN.eq(0)) {
        console.log('create');
        return encode('createFlow(address,address,int96,bytes)');
      } else if (!prevFlowRateBN.eq(flowRateBN)) {
        return encode('updateFlow(address,address,int96,bytes)');
      } // else no change, do nothing
    } else if (flowRateBN.eq(0)) {
      if (prevFlowRateBN.gt(0)) {
        return encode('deleteFlow(address,address,address,bytes)');
      } // else no change, do nothing
    } else {
      throw new ErrorException('invalid flow rate');
    }
    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
