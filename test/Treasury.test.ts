import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { Treasury } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { getGasCost } from './helper';

const fixture = async () => {
  const [contractOwner, randomAddress] = await ethers.getSigners();

  const deployment = await ethers.deployContract('Treasury', [contractOwner]);
  await deployment.waitForDeployment();
  return { contractOwner, randomAddress, deployment };
};

let g: {
  contractOwner: HardhatEthersSigner;
  randomAddress: HardhatEthersSigner;
  deployment: Treasury;
};

describe('Treasury', () => {
  beforeEach(async () => {
    g = await loadFixture(fixture);
  });

  it('revert actions if not owner', async () => {
    await expect(g.deployment.connect(g.randomAddress).withdraw(g.randomAddress, ethers.parseEther('1.0')))
      .to.be.revertedWithCustomError(g.deployment, 'OwnableUnauthorizedAccount')
      .withArgs(g.randomAddress);
  });

  it('reverts withdraw if balance is not enough', async () => {
    await expect(
      g.deployment.connect(g.contractOwner).withdraw(g.contractOwner, ethers.parseEther('1.0'))
    ).to.be.revertedWith('the balance is lower than the requested amount');
  });

  it('only admin can withdraw from treasury', async () => {
    const _initialBalance = await ethers.provider.getBalance(g.contractOwner);
    await g.randomAddress.sendTransaction({ to: g.deployment, value: ethers.parseEther('2.0') });
    const tx = await g.deployment.connect(g.contractOwner).withdraw(g.contractOwner, ethers.parseEther('1.5'));
    const gasCost = await getGasCost(tx);
    expect(await ethers.provider.getBalance(g.deployment)).to.equal(ethers.parseEther('0.5'));
    expect(await ethers.provider.getBalance(g.contractOwner)).to.equal(
      _initialBalance + ethers.parseEther('1.5') - gasCost
    );
  });

  it('withdraw not allow zero address', async () => {
    await expect(
      g.deployment.connect(g.contractOwner).withdraw(ethers.ZeroAddress, ethers.parseEther('1.5'))
    ).to.be.revertedWith('zero address is not allowed');
  });

  it('can receive eth', async () => {
    await g.randomAddress.sendTransaction({ to: g.deployment, value: ethers.parseEther('0.5') });
    expect(await ethers.provider.getBalance(g.deployment)).to.equal(ethers.parseEther('0.5'));
  });
});
