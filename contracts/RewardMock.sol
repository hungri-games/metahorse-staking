// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract RewardMock is ERC20 {
  constructor() ERC20('RewardMock', 'RMT') {
    _mint(msg.sender, 1000 * 10 ** decimals());
  }
}
