import { utils } from 'ethers';

async function id(_: unknown, text: string): Promise<string> {
  return utils.id(text);
}

export default id;
