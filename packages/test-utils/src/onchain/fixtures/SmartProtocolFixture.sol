// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// Test-only token/vault. Its approval mutates balanceOf to detect repeated reads.
contract SmartProtocolFixture {
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public quotedBalance = 7;
    uint256 public deposited;
    address public receiver;
    uint256 public zeroResets;
    uint256 public approvals;
    function asset() external view returns (address) { return address(this); }
    function balanceOf(address) external view returns (uint256) { return quotedBalance; }
    function approve(address spender, uint256 value) external returns (bool) {
        require(value == 0 || allowance[msg.sender][spender] == 0, "reset required");
        allowance[msg.sender][spender] = value;
        quotedBalance = 99;
        approvals++;
        if (value == 0) zeroResets++;
        return true;
    }
    function deposit(uint256 amount, address to) external returns (uint256 shares) {
        require(allowance[msg.sender][address(this)] == amount, "snapshot mismatch");
        deposited = amount;
        receiver = to;
        return amount * 2;
    }
    function reset() external { quotedBalance = 7; deposited = 0; zeroResets = 0; approvals = 0; }
    struct Pair { uint256 amount; address to; }
    function nested(Pair[] calldata pairs, string calldata label, bytes calldata payload) external {
        require(keccak256(bytes(label)) == keccak256("hello") && keccak256(payload) == keccak256(hex"1234"), "nested encoding");
        deposited = pairs[0].amount;
        receiver = pairs[0].to;
    }
    function outputs() external pure returns (uint256, Pair memory, bool, bytes4, uint256[2] memory) {
        return (5, Pair(6, address(0x1234)), true, bytes4(0xabcdef00), [uint256(7), uint256(8)]);
    }
}
