import { utils } from 'ethers';

export const MINIME_TOKEN_FACTORIES = new Map([
  [1, '0xA29EF584c389c67178aE9152aC9C543f9156E2B3'],
  [4, '0xad991658443c56b3dE2D7d7f5d8C68F339aEef29'],
  [100, '0xf7d36d4d46cda364edc85e5561450183469484c5'],
  [137, '0xcFed1594A5b1B612dC8199962461ceC148F14E68'],
]);

export const MINIME_TOKEN_FACTORY_INTERFACE = new utils.Interface([
  'function createCloneToken(address,uint,string,uint8,string,bool) external returns (address)',
]);

export const CONTROLLED_INTERFACE = new utils.Interface([
  'function changeController(address) external',
]);
