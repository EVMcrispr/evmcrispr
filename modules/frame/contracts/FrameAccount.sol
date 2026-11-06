// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HegotaSupport, Devnet, Scope, TxParam} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";

/// an account whose VERIFY frame accepts an EIP-712 signature by its owner over the frame transaction's
/// signature hash, carried in an ARBITRARY signature entry (index 0). No storage: owner and domain are immutable.
contract FrameAccount is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    address public immutable owner;
    bytes32 public immutable domainSeparator;
    bytes32 private constant TYPEHASH = keccak256("FrameTransaction(bytes32 sigHash)");

    constructor(address owner_) {
        owner = owner_;
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("EVMcrispr Frame Account"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    receive() external payable {}

    /// The VERIFY frame lands here, with the scope its flags allow (execution, or execution and payment).
    function verify(uint8 scope) external {
        bytes32 sigHash = bytes32(txparam(TxParam.SIG_HASH));
        bytes memory sig = sigdatacopy(0, 65, 0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, keccak256(abi.encode(TYPEHASH, sigHash))));
        require(ecrecover(digest, v, r, s) == owner, "bad signature");
        approve(Scope(scope));
    }
}
