import { ethers } from 'hardhat';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const treasuryDeployment = await ethers.deployContract('Treasury');
  await treasuryDeployment.waitForDeployment();
  const stakingDeployment = await ethers.deployContract('Staking', [
    '<owner>',
    'reward token address',
    await treasuryDeployment.getAddress()
  ]);
  await stakingDeployment.waitForDeployment();
  console.log(`Treasury contract deployed to ${await treasuryDeployment.getAddress()}`);
  console.log(`Staking contract deployed to ${await stakingDeployment.getAddress()}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
