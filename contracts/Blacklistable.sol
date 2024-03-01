// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title Blacklisting address functionality
 * @author Orgil
 * @notice Serves blocking transfers to listed addresses
 * @dev Inherits the OpenZepplin Ownable implentations
 * @dev Blacklistable class is abstract
 */
abstract contract Blacklistable is Ownable {
  /**
   * @dev Storing blacklisted accounts
   */
  mapping(address => bool) internal blacklist;

  /**
   * @dev Event triggered when account added to the blacklist
   * @param _account The address of the account that added to the blacklist
   */
  event AddedToBlacklist(address indexed _account);

  /**
   * @dev Event triggered when account removed from the blacklist
   * @param _account The address of the account that removed from the blacklist
   */
  event RemovedFromBlacklist(address indexed _account);

  /**
   * @dev Throws if called by blacklisted address of account.
   */
  modifier notBlacklisted(address _account) {
    require(blacklist[_account] == false, 'Address is blacklisted');
    _;
  }

  /**
   * @notice Check an address of account is whether blacklisted or not
   * @dev Check an address of account is whether blacklisted or not
   * @param _account The address of the account that going to be checked
   * @return bool Indicates if account is blacklisted or not
   */
  function isBlacklisted(address _account) external view returns (bool) {
    return blacklist[_account];
  }

  /**
   * @notice Add address of the account to the blacklist
   * @dev Adding to the blacklist functionality is called by only owner of the contract
   * @param _account The address of the account that going to added to blacklist
   */
  function addToBlacklist(address _account) external onlyOwner {
    blacklist[_account] = true;
    /**
     * @dev Triggers AddedToBlacklist event after address is blacklisted
     */
    emit AddedToBlacklist(_account);
  }

  /**
   * @notice Add address of the account to remove from the blacklist
   * @dev Removing from the blacklist functionality is called by only owner of the contract
   * @param _account The address of the account that going to removed from the blacklist
   */
  function removeFromBlacklist(address _account) external onlyOwner {
    blacklist[_account] = false;
    /**
     * @dev Triggers RemovedFromBlacklist event after address is removed from blacklist
     */
    emit RemovedFromBlacklist(_account);
  }
}
