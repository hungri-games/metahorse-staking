// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './Blacklistable.sol';
import './Library.sol';

error Stake__InsufficentFund();
error Staking__TransferFailed();
error Unstake__TransferFailed();
error Withdraw__TransferFailed();
error AirDrop__TransferFailed();

contract MetahorseStaking is Pausable, Blacklistable, ReentrancyGuard {
  using Addresses for address[];

  struct StakePool {
    uint8 mode;
    uint256 poolBalance;
    uint256 treasuryBalance;
    uint256 stakeTime;
    uint256 lockPeriod;
    bool unstaked;
  }

  IERC20 public tokenAddress;
  address public treasuryAddress;

  uint256 private _totalStaked;
  uint private _airdropDate;
  uint256 private _fee;
  uint256 private _threshold;

  /// @notice track stakers
  address[] public stakers;
  /// @notice track users staking pools
  mapping(address => StakePool[]) public pools;
  /// @notice track previous rewards
  mapping(address => uint256) public rewards;

  event ReceivedEth(address from, uint256 amount);
  event Staked(address indexed account, uint256 amount);
  event UnStaked(address indexed account, uint256 amount);

  modifier nonZero(address sender) {
    require(sender != address(0), 'zero address is not allowed');
    _;
  }

  modifier canStake(uint8 mode) {
    require(mode < 3 && mode >= 0, 'Invalid staking mode.');
    require(block.timestamp < _airdropDate, "You can't stake at the moment.");
    _;
  }

  modifier canAirDrop() {
    require(block.timestamp > _airdropDate, 'Staking is ongoing.');
    _;
  }

  constructor(address initialOwner, address rewardTokenAddress, address _treasuryAddress) Ownable(initialOwner) {
    _fee = 100;
    _threshold = 1000;
    treasuryAddress = _treasuryAddress;
    tokenAddress = IERC20(rewardTokenAddress);
  }

  receive() external payable {
    emit ReceivedEth(msg.sender, msg.value);
  }

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  ///@notice contract total holding
  function getTotalStaked() public view returns (uint256) {
    return _totalStaked;
  }

  function getTotalStakers() public view returns (uint256) {
    return stakers.length;
  }

  function getAirdropDate() public view returns (uint) {
    return _airdropDate;
  }

  function getUnstakeFee() public view returns (uint256) {
    return _fee;
  }

  function setAirdropDate(uint airdropDate) public onlyOwner {
    _airdropDate = airdropDate;
  }

  function setThreshold(uint256 threshold) public onlyOwner {
    _threshold = threshold;
  }

  function setEarlyUnstakeFee(uint256 fee) public onlyOwner {
    _fee = fee;
  }

  ///@notice users balance on contract
  function getTotalStakedBalance(uint8 mode) external view nonZero(msg.sender) returns (uint256) {
    address poolOwner = msg.sender;

    uint256 _total;
    uint256 _length = pools[poolOwner].length;
    for (uint256 i; i < _length; ) {
      StakePool memory pool = pools[poolOwner][i];
      if (!pool.unstaked && pool.mode == mode) {
        _total += pools[poolOwner][i].poolBalance;
        _total += pools[poolOwner][i].treasuryBalance;
      }
      unchecked {
        i++;
      }
    }

    return _total;
  }

  //Get the Treasury Address.
  function getTreasuryAddress() external view returns (address) {
    return treasuryAddress;
  }

  function _calculateReward(StakePool memory pool) internal view returns (uint256) {
    uint256 _total;
    uint256 _totalMinutes;
    if (_airdropDate > (pool.stakeTime + pool.lockPeriod)) {
      if (block.timestamp > (pool.stakeTime + pool.lockPeriod)) {
        _totalMinutes = pool.lockPeriod / 60; //21600
      } else {
        _totalMinutes = (block.timestamp - pool.stakeTime) / 60;
      }
    } else {
      if (block.timestamp < _airdropDate) {
        _totalMinutes = (block.timestamp - pool.stakeTime) / 60;
      } else {
        _totalMinutes = (_airdropDate - pool.stakeTime) / 60;
      }
    }

    uint256 _balance = pool.poolBalance + pool.treasuryBalance;
    if (pool.mode == 0) {
      _total += (_totalMinutes * _balance) / 24 / 60;
    } else if (pool.mode == 1) {
      _total += (_totalMinutes * _balance * 3) / 2 / 24 / 60;
    } else {
      _total += (_totalMinutes * _balance * 3) / 24 / 60;
    }
    return _total;
  }

  function getTotalReward(address poolOwner) public view returns (uint256) {
    uint256 _total;
    uint256 _length = pools[poolOwner].length;
    for (uint256 i; i < _length; ) {
      StakePool memory pool = pools[poolOwner][i];
      if (!pool.unstaked) {
        _total += _calculateReward(pool);
      }
      unchecked {
        i++;
      }
    }
    return _total + rewards[poolOwner];
  }

  /// @notice Airdrop function. Stakers can get bonus Munity token.
  /// @dev only owner callable
  function airDrop() external onlyOwner canAirDrop {
    uint256 remains = tokenAddress.balanceOf(address(this));
    require(remains > 0, 'No rewards allocated.');

    uint256 _total;
    uint256 _length = stakers.length;
    for (uint256 i; i < _length; ) {
      _total += getTotalReward(stakers[i]);
      unchecked {
        i++;
      }
    }

    for (uint256 i; i < _length; ) {
      uint256 _reward = getTotalReward(stakers[i]);
      if (_reward > 0) {
        bool _success = tokenAddress.transfer(stakers[i], (remains * _reward) / _total);
        rewards[stakers[i]] = 0;
        if (!_success) {
          revert AirDrop__TransferFailed();
        }
      }
      unchecked {
        i++;
      }
    }
  }

  function stake(
    uint8 mode
  ) external payable nonReentrant notBlacklisted(msg.sender) nonZero(msg.sender) canStake(mode) whenNotPaused {
    address _from = msg.sender;

    uint256 _amount = msg.value;
    require(_amount > 0, '0 value is not allowed');

    (bool _success, ) = address(this).call{value: _amount}('');
    if (!_success) {
      revert Staking__TransferFailed();
    }

    _totalStaked += _amount;

    uint256 _poolAmount = _amount;
    uint256 _treasuryAmount;
    uint256 _currentEthBalance = address(this).balance;
    if (_currentEthBalance > 1 ether) {
      _treasuryAmount = (_amount * _threshold) / 10000;
      _poolAmount -= _treasuryAmount;

      (bool sent, ) = treasuryAddress.call{value: _treasuryAmount}('');
      if (!sent) {
        revert Staking__TransferFailed();
      }
    }

    StakePool memory pool;
    pool.mode = mode;
    pool.poolBalance = _poolAmount;
    pool.treasuryBalance = _treasuryAmount;
    pool.stakeTime = block.timestamp;

    if (mode == 0) {
      pool.lockPeriod = 15 days;
    } else if (mode == 1) {
      pool.lockPeriod = 30 days;
    } else {
      pool.lockPeriod = 90 days;
    }

    pools[_from].push(pool);

    if (!stakers.exist(_from)) {
      stakers.push(_from);
    }

    emit Staked(_from, _amount);
  }

  // Unstake the available ETH.
  function unstake(uint8 mode) external nonReentrant notBlacklisted(msg.sender) nonZero(msg.sender) whenNotPaused {
    address owner = msg.sender;

    bool _payFee;
    uint256 _totalBalance;

    bool firstPool;
    bool _hasOtherPools;

    uint256 _length = pools[owner].length;
    for (uint256 i; i < _length; ) {
      StakePool storage pool = pools[owner][i];
      if (!pool.unstaked) {
        if (mode == pool.mode) {
          if (firstPool == false) {
            if (block.timestamp < pool.stakeTime + pool.lockPeriod) {
              _payFee = true;
            }
            firstPool = true;
          }
          _totalBalance += pool.poolBalance + pool.treasuryBalance;
          if (!_payFee) {
            rewards[owner] += _calculateReward(pool);
          }
          pool.unstaked = true;
        } else {
          _hasOtherPools = true;
        }
      }

      unchecked {
        i++;
      }
    }

    if (_totalBalance == 0) {
      revert Unstake__TransferFailed();
    }

    if (!_hasOtherPools) {
      stakers.remove(owner);
    }

    uint256 _totalUnstaked = _totalBalance;
    if (_payFee) {
      uint256 _feeBalance = (_totalBalance * _fee) / 10000;
      (bool success, ) = address(this).call{value: _feeBalance}('');
      if (!success) {
        revert Unstake__TransferFailed();
      }

      _totalBalance -= _feeBalance;
    }

    if (_totalBalance > address(this).balance) {
      revert Stake__InsufficentFund();
    }

    (bool _success, ) = owner.call{value: _totalBalance}('');
    if (!_success) {
      revert Unstake__TransferFailed();
    }

    _totalStaked -= _totalUnstaked;
    emit UnStaked(owner, _totalUnstaked);
  }
}
