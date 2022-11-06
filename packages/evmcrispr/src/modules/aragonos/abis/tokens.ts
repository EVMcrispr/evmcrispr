export const erc20ABI = [
  'function balanceOf(address _who) public view returns (uint256)',
  'function allowance(address _owner, address _spender) public view returns (uint256)',
  'function approve(address _spender, uint256 _value) public returns (bool)',
  'function transfer(address _to, uint256 _amount) public returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) public returns (bool)',
];
