// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Addresses {
  function exist(address[] storage _array, address element) internal view returns (bool) {
    for (uint256 i; i < _array.length; ) {
      if (_array[i] == element) {
        return true;
      }
      unchecked {
        i++;
      }
    }

    return false;
  }

  function remove(address[] storage _array, address _element) internal {
    for (uint256 i; i < _array.length; ) {
      if (_array[i] == _element) {
        _array[i] = _array[_array.length - 1];
        _array.pop();
        break;
      }
      unchecked {
        i++;
      }
    }
  }
}
