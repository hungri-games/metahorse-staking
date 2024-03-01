// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';

contract Treasury is Ownable {
  constructor(address initialOwner) Ownable(initialOwner) {}

  /// @notice Function allows only the owner to withdraw all the funds in the contract
  function withdraw(address payable _to, uint256 _amount) external onlyOwner {
    require(_to != address(0), 'zero address is not allowed');
    require(_amount <= address(this).balance, 'the balance is lower than the requested amount');

    (bool sent, ) = _to.call{value: _amount}('');

    require(sent, 'Failed to send Ether');
  }

  receive() external payable {}
}
