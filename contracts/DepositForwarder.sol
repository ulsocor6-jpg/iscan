// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IForwarderFactory {
    function treasury() external view returns (address);
    function tokenCount() external view returns (uint256);
    function tokenAt(uint256 i) external view returns (address);
}

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title DepositForwarder
/// @notice Minimal, no-private-key deposit address. Anyone may call
/// `sweep()` — funds always move to the factory's configured treasury,
/// so an unrestricted caller can never redirect funds anywhere else.
/// Deployed via CREATE2 by ForwarderFactory using a per-user salt, so its
/// address is computable off-chain before deployment — the same property
/// HD wallet derivation gave us, without ever holding a private key.
contract DepositForwarder {
    address public immutable factory;

    constructor() {
        factory = msg.sender;
        _sweep();
    }

    /// @notice Forward this address's full native + known-token balances
    /// to the factory's treasury. Safe to call repeatedly, safe for
    /// anyone to call: the destination is fixed by the factory, never by
    /// the caller.
    function sweep() external {
        _sweep();
    }

    function _sweep() internal {
        address treasury = IForwarderFactory(factory).treasury();

        uint256 nativeBalance = address(this).balance;
        if (nativeBalance > 0) {
            (bool ok, ) = payable(treasury).call{value: nativeBalance}("");
            require(ok, "DepositForwarder: native transfer failed");
        }

        uint256 count = IForwarderFactory(factory).tokenCount();
        for (uint256 i = 0; i < count; i++) {
            address token = IForwarderFactory(factory).tokenAt(i);
            uint256 bal = IERC20Like(token).balanceOf(address(this));
            if (bal > 0) {
                require(
                    IERC20Like(token).transfer(treasury, bal),
                    "DepositForwarder: token transfer failed"
                );
            }
        }
    }

    /// @dev Accept plain native-currency transfers (e.g. RON, ETH deposits).
    receive() external payable {}
}
