import { sponsors } from '../assets/sponsors.json';

function client(chainId: number | undefined): string | undefined {
  switch (chainId) {
    case 4:
      return 'rinkeby.client.aragon.org';
    case 100:
      return 'aragon.1hive.org';
    default:
      return 'client.aragon.org';
  }
}

function parsedSponsors(): string {
  switch (sponsors.length) {
    case 1:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>`;
    case 2:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a> and <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>`;
    case 3:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>, <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>, and <a href="${sponsors[2][1]}">${sponsors[2][0]}</a>`;
    default:
      return '';
  }
}

export { client, parsedSponsors };
