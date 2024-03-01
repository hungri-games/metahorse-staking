import { ethers } from 'hardhat';
import { ContractTransactionResponse } from 'ethers';

export const getGasCost = async (tx: ContractTransactionResponse) => {
  const receipt = await tx.wait();
  return receipt ? receipt.gasUsed * receipt.gasPrice : ethers.parseEther('0.0');
};
