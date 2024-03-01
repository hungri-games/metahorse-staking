// SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { MetahorseStaking, RewardMock, Treasury } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { getGasCost } from './helper';
import dayjs from 'dayjs';

const fixture = async () => {
  const [stakeOwner, staker1, staker2] = await ethers.getSigners();

  const treasury = await ethers.getContractFactory('Treasury');
  const treasuryAddress = await treasury.deploy(stakeOwner);
  await treasuryAddress.waitForDeployment();

  const rewardMock = await ethers.getContractFactory('RewardMock');
  const rewardToken = await rewardMock.deploy();
  await rewardToken.waitForDeployment();

  const staking = await ethers.getContractFactory('MetahorseStaking');
  const deployment = await staking.deploy(
    stakeOwner,
    await rewardToken.getAddress(),
    await treasuryAddress.getAddress()
  );

  await deployment.waitForDeployment();
  const airdropDate = dayjs().add(20, 'days').unix();
  await deployment.setAirdropDate(airdropDate);
  await rewardToken.transfer(await deployment.getAddress(), ethers.parseEther('1000'));

  return { stakeOwner, treasuryAddress, rewardToken, deployment, staker1, staker2, airdropDate };
};

let g: {
  stakeOwner: HardhatEthersSigner;
  treasuryAddress: Treasury;
  rewardToken: RewardMock;
  deployment: MetahorseStaking;
  staker1: HardhatEthersSigner;
  staker2: HardhatEthersSigner;
  airdropDate: number;
};

describe('MetahorseStaking', () => {
  beforeEach(async () => {
    g = await loadFixture(fixture);
  });
  it('returns treasuryAddress', async () => {
    expect(await g.deployment.getTreasuryAddress()).to.equal(g.treasuryAddress);
  });

  describe('Blacklisting', () => {
    it('revert blacklist actions if not owner', async () => {
      await expect(g.deployment.connect(g.staker1).addToBlacklist(g.staker2))
        .to.be.revertedWithCustomError(g.deployment, 'OwnableUnauthorizedAccount')
        .withArgs(g.staker1);
      await expect(g.deployment.connect(g.staker1).removeFromBlacklist(g.staker2))
        .to.be.revertedWithCustomError(g.deployment, 'OwnableUnauthorizedAccount')
        .withArgs(g.staker1);
    });

    it('no actions if account is blacklisted', async () => {
      await g.deployment.addToBlacklist(g.staker1);
      expect(await g.deployment.connect(g.staker1).isBlacklisted(g.staker1)).to.be.true;
      await expect(
        g.deployment.connect(g.staker1).stake(1, { from: g.staker1, value: ethers.parseEther('0.2') })
      ).to.be.revertedWith('Address is blacklisted');
      await expect(g.deployment.connect(g.staker1).unstake(1)).to.be.revertedWith('Address is blacklisted');
    });

    it('only owner add or remove account from blacklist', async () => {
      await g.deployment.connect(g.stakeOwner).addToBlacklist(g.staker1);
      expect(await g.deployment.connect(g.staker1).isBlacklisted(g.staker1)).to.be.true;

      await g.deployment.connect(g.stakeOwner).removeFromBlacklist(g.staker1);
      expect(await g.deployment.connect(g.staker1).isBlacklisted(g.staker1)).to.be.false;
    });
  });

  describe('Pause', () => {
    it('only admin can pause or unpause operation', async () => {
      await g.deployment.connect(g.stakeOwner).pause();
      expect(await g.deployment.connect(g.stakeOwner).paused()).to.be.true;

      await g.deployment.connect(g.stakeOwner).unpause();
      expect(await g.deployment.connect(g.stakeOwner).paused()).to.be.false;
    });
  });

  describe('Staking', () => {
    describe('User', () => {
      it('can stake into pool by selecting duration', async () => {
        await g.deployment.connect(g.staker1).stake(0, { from: g.staker1, value: ethers.parseEther('2.2') });
        await time.increase(3600);
        await g.deployment.connect(g.staker1).stake(1, { from: g.staker1, value: ethers.parseEther('1.2') });
        await g.deployment.connect(g.staker2).stake(2, { from: g.staker2, value: ethers.parseEther('0.2') });
        expect(await g.deployment.getTotalStaked()).to.equal(ethers.parseEther('3.6'));
      });

      it('not allow zero amount for staking', async () => {
        await expect(
          g.deployment.connect(g.staker1).stake(2, { from: g.staker1, value: ethers.parseEther('0.0') })
        ).to.be.revertedWith('0 value is not allowed');
      });

      it('can see air drop date', async () => {
        expect(await g.deployment.getAirdropDate()).to.equal(g.airdropDate);
      });

      it('can see unstake fee', async () => {
        expect(await g.deployment.getUnstakeFee()).to.equal(100);
      });

      it('10% will transferred to treasury if enough liquidity', async () => {
        await g.deployment.connect(g.stakeOwner).setThreshold(10000);
        const _initialBalance = await ethers.provider.getBalance(g.treasuryAddress);
        await g.deployment.connect(g.staker1).stake(1, { from: g.staker1, value: ethers.parseEther('1') });
        await time.increase(3600);
        await g.deployment.connect(g.staker2).stake(2, { from: g.staker2, value: ethers.parseEther('1') });
        const _treasuryBalance = await ethers.provider.getBalance(g.treasuryAddress);
        expect(_treasuryBalance).to.equal(_initialBalance + ethers.parseEther('1.0'));
      });

      it('can unstake after stake maturity along with reward', async () => {
        const _initialBalance = await ethers.provider.getBalance(g.staker1);
        const tx1 = await g.deployment
          .connect(g.staker1)
          .stake(0, { from: g.staker1, value: ethers.parseEther('1.0') });
        const gas1 = await getGasCost(tx1);
        expect(await g.deployment.getTotalStakers()).to.equal(1);
        expect(await ethers.provider.getBalance(g.staker1)).to.equal(_initialBalance - gas1 - ethers.parseEther('1.0'));
        await time.increase(3600 * 24 * 18);
        expect(await g.deployment.connect(g.staker1).getTotalReward(g.staker1)).to.equal(ethers.parseEther('15.0'));

        const tx2 = await g.deployment.connect(g.staker1).unstake(0);
        const gas2 = await getGasCost(tx2);
        expect(await g.deployment.getTotalStakers()).to.equal(0);
        expect(await ethers.provider.getBalance(g.staker1)).to.equal(
          _initialBalance - gas1 - ethers.parseEther('1.0') - gas2 + ethers.parseEther('1.0')
        );
        expect(await g.deployment.connect(g.staker1).getTotalReward(g.staker1)).to.equal(ethers.parseEther('15.0'));
      });

      it('can unstake before stake maturity without reward and pay fee', async () => {
        const _initialBalance = await ethers.provider.getBalance(g.staker1);
        const tx1 = await g.deployment
          .connect(g.staker1)
          .stake(0, { from: g.staker1, value: ethers.parseEther('1.0') });
        const gas1 = await getGasCost(tx1);
        expect(await g.deployment.getTotalStakers()).to.equal(1);
        expect(await ethers.provider.getBalance(g.staker1)).to.equal(_initialBalance - gas1 - ethers.parseEther('1.0'));

        await time.increase(3600 * 24 * 9);
        expect(await g.deployment.connect(g.staker1).getTotalReward(g.staker1)).to.equal(ethers.parseEther('9.0'));

        const tx2 = await g.deployment.connect(g.staker1).unstake(0);
        const gas2 = await getGasCost(tx2);
        expect(await g.deployment.getTotalStakers()).to.equal(0);
        expect(await ethers.provider.getBalance(g.staker1)).to.equal(
          _initialBalance -
            gas1 -
            ethers.parseEther('1.0') -
            gas2 +
            ethers.parseEther('1.0') -
            ethers.parseEther('0.01')
        );
      });

      it('invalid mode error when wrong mode passed', async () => {
        const stake = g.deployment.connect(g.staker1).stake(5, { from: g.staker1, value: ethers.parseEther('0.2') });
        await expect(stake).to.be.revertedWith('Invalid staking mode.');
      });

      it('total stakers', async () => {
        await g.deployment.connect(g.staker1).stake(0, { from: g.staker1, value: ethers.parseEther('0.2') });
        await g.deployment.connect(g.staker1).stake(1, { from: g.staker1, value: ethers.parseEther('0.2') });
        expect(await g.deployment.getTotalStakers()).to.equal(1);
        await g.deployment.connect(g.staker2).stake(1, { from: g.staker2, value: ethers.parseEther('0.2') });
        expect(await g.deployment.getTotalStakers()).to.equal(2);
        await g.deployment.connect(g.staker1).unstake(0);
        expect(await g.deployment.getTotalStakers()).to.equal(2);
        await g.deployment.connect(g.staker1).unstake(1);
        expect(await g.deployment.getTotalStakers()).to.equal(1);
        await g.deployment.connect(g.staker2).unstake(1);
        expect(await g.deployment.getTotalStakers()).to.equal(0);
      });

      it('can get total staked value per mode', async () => {
        await g.deployment.connect(g.staker1).stake(2, { from: g.staker1, value: ethers.parseEther('1') });
        await g.deployment.connect(g.staker1).stake(0, { from: g.staker1, value: ethers.parseEther('0.1') });
        expect(await g.deployment.connect(g.staker1).getTotalStakedBalance(2)).to.equal(ethers.parseEther('1'));
        expect(await g.deployment.connect(g.staker1).getTotalStakedBalance(0)).to.equal(ethers.parseEther('0.1'));
      });

      it('reward calculation', async () => {
        await g.deployment.connect(g.staker1).stake(2, { from: g.staker1, value: ethers.parseEther('1') });
        await time.increase(3600);
        expect(await g.deployment.connect(g.staker1).getTotalReward(g.staker1)).to.equal(ethers.parseEther('0.125'));
      });

      it('airdrop', async () => {
        expect(await g.rewardToken.balanceOf(await g.deployment.getAddress())).to.equal(ethers.parseEther('1000'));

        await g.deployment.connect(g.staker1).stake(0, { from: g.staker1, value: ethers.parseEther('1') });
        await g.deployment.connect(g.staker2).stake(0, { from: g.staker2, value: ethers.parseEther('3') });
        await time.increase(3600 * 24 * 21);

        expect(await g.deployment.connect(g.staker1).getTotalReward(g.staker1)).to.equal(ethers.parseEther('15'));
        expect(await g.deployment.connect(g.staker2).getTotalReward(g.staker2)).to.equal(ethers.parseEther('45'));

        expect(await g.deployment.connect(g.stakeOwner).airDrop()).to.changeTokenBalance(
          g.rewardToken,
          g.deployment,
          -1000
        );
        expect(await g.rewardToken.balanceOf(g.staker1)).to.equal(ethers.parseEther('250'));
        expect(await g.rewardToken.balanceOf(g.staker2)).to.equal(ethers.parseEther('750'));
      });
    });

    describe('Admin', () => {
      it('can set unstake fee', async () => {
        await g.deployment.connect(g.stakeOwner).setEarlyUnstakeFee(200);
        expect(await g.deployment.getUnstakeFee()).to.equal(200);
      });
    });
  });
});
