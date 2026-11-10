// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HegotaSupport, Devnet, Scope, TxParam} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";

/// pays the gas of one account's frame transactions. Funded by plain transfers; its owner can withdraw.
/// No storage and no BALANCE (banned for an unstaked payer during validation).
/// The same sponsor built for the Hegota devnet (hegota-support's EIP7906_WORKSHOP).
contract FrameSponsorHegota is HegotaSupport(Devnet.EIP7906_WORKSHOP) {
    address public immutable owner;
    address public immutable sponsored;

    constructor(address owner_, address sponsored_) payable {
        require(owner_ != address(0) && sponsored_ != address(0), "zero address");
        owner = owner_;
        sponsored = sponsored_;
    }

    receive() external payable {}

    /// The pay frame lands here.
    function verify() external {
        require(address(uint160(txparam(TxParam.SENDER))) == sponsored, "not sponsored");
        approve(Scope.PAYMENT);
    }

    function withdraw(address payable to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }
}
