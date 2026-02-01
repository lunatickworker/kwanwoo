import { ethers } from 'ethers';
import { 
  sendTronTransaction as sendTronTx, 
  getTronWalletBalance, 
  estimateTronGas,
  isValidTronAddress 
} from './tronTransaction';

/**
 * 블록체인 트랜잭션 전송 유틸리티
 */

interface TransactionParams {
  privateKey: string;
  toAddress: string;
  tokenAddress: string | null; // null이면 네이티브 토큰 (ETH, MATIC 등)
  amount: string; // 실제 금액 (소수점 포함)
  decimals: number;
  rpcUrl: string;
  chainId: number;
}

interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  receipt?: ethers.TransactionReceipt;
}

interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  estimatedCost: string; // 네이티브 토큰 단위 (ETH, MATIC 등)
  estimatedCostUsd?: number;
}

/**
 * ERC-20 토큰 전송
 */
export async function sendERC20Transaction(params: TransactionParams): Promise<TransactionResult> {
  const { privateKey, toAddress, tokenAddress, amount, decimals, rpcUrl, chainId } = params;

  try {
    if (!tokenAddress) {
      throw new Error('ERC-20 토큰 주소가 필요합니다');
    }

    // Tron 네트워크 감지 → Tron 전용 함수 사용
    if (rpcUrl.includes('trongrid.io') || rpcUrl.includes('tronapi')) {
      return sendTronTx({
        privateKey,
        toAddress,
        tokenAddress,
        amount,
        decimals,
        fullNode: rpcUrl
      });
    }

    // Provider 및 Wallet 생성
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const wallet = new ethers.Wallet(privateKey, provider);

    // ERC-20 ABI (transfer 함수만)
    const erc20Abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];

    const contract = new ethers.Contract(tokenAddress, erc20Abi, wallet);

    // 금액을 wei 단위로 변환
    const amountInWei = ethers.parseUnits(amount, decimals);

    console.log('🔄 ERC-20 전송 시작:', {
      from: wallet.address,
      to: toAddress,
      token: tokenAddress,
      amount,
      amountInWei: amountInWei.toString(),
      chainId
    });

    // 트랜잭션 전송
    const tx = await contract.transfer(toAddress, amountInWei);
    console.log('📤 트랜잭션 전송됨:', tx.hash);

    // 트랜잭션 확인 대기
    const receipt = await tx.wait();
    console.log('✅ 트랜잭션 확인됨:', receipt?.hash);

    return {
      success: true,
      txHash: receipt?.hash,
      receipt: receipt || undefined
    };

  } catch (error: any) {
    console.error('❌ ERC-20 전송 실패:', error);
    return {
      success: false,
      error: error.message || '트랜잭션 전송 실패'
    };
  }
}

/**
 * 네이티브 토큰 전송 (ETH, MATIC 등)
 */
export async function sendNativeTransaction(params: TransactionParams): Promise<TransactionResult> {
  const { privateKey, toAddress, amount, decimals, rpcUrl, chainId } = params;

  try {
    // Provider 및 Wallet 생성
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const wallet = new ethers.Wallet(privateKey, provider);

    // 금액을 wei 단위로 변환
    const amountInWei = ethers.parseUnits(amount, decimals);

    console.log('🔄 네이티브 토큰 전송 시작:', {
      from: wallet.address,
      to: toAddress,
      amount,
      amountInWei: amountInWei.toString(),
      chainId
    });

    // 트랜잭션 전송
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountInWei
    });
    console.log('📤 트랜잭션 전송됨:', tx.hash);

    // 트랜잭션 확인 대기
    const receipt = await tx.wait();
    console.log('✅ 트랜잭션 확인됨:', receipt?.hash);

    return {
      success: true,
      txHash: receipt?.hash,
      receipt: receipt || undefined
    };

  } catch (error: any) {
    console.error('❌ 네이티브 토큰 전송 실패:', error);
    return {
      success: false,
      error: error.message || '트랜잭션 전송 실패'
    };
  }
}

/**
 * 가스비 추정
 */
export async function estimateGas(params: Omit<TransactionParams, 'privateKey'>): Promise<GasEstimate | null> {
  const { toAddress, tokenAddress, amount, decimals, rpcUrl, chainId } = params;

  try {
    // Tron 네트워크 감지 → Tron 전용 함수 사용
    if (rpcUrl.includes('trongrid.io') || rpcUrl.includes('tronapi')) {
      console.log('🔶 Tron 네트워크 감지: Tron 가스비 추정');
      const tronEstimate = await estimateTronGas(
        toAddress,
        tokenAddress,
        amount,
        decimals,
        rpcUrl
      );

      if (!tronEstimate) {
        return null;
      }

      return {
        gasLimit: BigInt(tronEstimate.energy || 0),
        gasPrice: BigInt(0),
        estimatedCost: tronEstimate.estimatedCost
      };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    
    let gasLimit: bigint;
    
    if (tokenAddress) {
      // ERC-20 토큰 가스 추정
      const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
      const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      const amountInWei = ethers.parseUnits(amount, decimals);
      
      gasLimit = await contract.transfer.estimateGas(toAddress, amountInWei);
    } else {
      // 네이티브 토큰 가스 추정
      const amountInWei = ethers.parseUnits(amount, decimals);
      gasLimit = await provider.estimateGas({
        to: toAddress,
        value: amountInWei
      });
    }

    // 현재 가스 가격 조회
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);

    // 총 가스 비용 계산 (wei 단위)
    const totalCost = gasLimit * gasPrice;

    // ETH 단위로 변환
    const estimatedCost = ethers.formatEther(totalCost);

    console.log('⛽ 가스비 추정:', {
      gasLimit: gasLimit.toString(),
      gasPrice: gasPrice.toString(),
      totalCost: totalCost.toString(),
      estimatedCost
    });

    return {
      gasLimit,
      gasPrice,
      estimatedCost
    };

  } catch (error: any) {
    console.error('❌ 가스비 추정 실패:', error);
    return null;
  }
}

/**
 * 지갑 잔액 조회
 */
export async function getWalletBalance(
  address: string,
  tokenAddress: string | null,
  rpcUrl: string,
  chainId: number,
  decimals: number = 18
): Promise<{ balance: string; balanceInWei: bigint } | null> {
  try {
    // Tron 네트워크 감지 → Tron 전용 함수 사용
    if (rpcUrl.includes('trongrid.io') || rpcUrl.includes('tronapi')) {
      console.log('🔶 Tron 네트워크 감지: Tron 잔액 조회');
      const tronBalance = await getTronWalletBalance(
        address,
        tokenAddress,
        rpcUrl,
        decimals
      );

      if (!tronBalance) {
        return null;
      }

      return {
        balance: tronBalance.balance,
        balanceInWei: BigInt(tronBalance.balanceInSun)
      };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

    if (tokenAddress) {
      // ERC-20 토큰 잔액 조회
      const erc20Abi = ['function balanceOf(address owner) view returns (uint256)'];
      const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      const balanceInWei = await contract.balanceOf(address);
      const balance = ethers.formatUnits(balanceInWei, decimals);
      
      return { balance, balanceInWei };
    } else {
      // 네이티브 토큰 잔액 조회
      const balanceInWei = await provider.getBalance(address);
      const balance = ethers.formatUnits(balanceInWei, decimals);
      
      return { balance, balanceInWei };
    }
  } catch (error: any) {
    console.error('❌ 잔액 조회 실패:', error);
    return null;
  }
}

/**
 * 통합 트랜잭션 전송 함수
 */
export async function sendTransaction(params: TransactionParams): Promise<TransactionResult> {
  // Tron 네트워크 감지 → Tron 전용 함수 사용
  if (params.rpcUrl.includes('trongrid.io') || params.rpcUrl.includes('tronapi')) {
    console.log('🔶 Tron 네트워크 감지: Tron 트랜잭션 전송');
    return sendTronTx({
      privateKey: params.privateKey,
      toAddress: params.toAddress,
      tokenAddress: params.tokenAddress,
      amount: params.amount,
      decimals: params.decimals,
      fullNode: params.rpcUrl
    });
  }

  // EVM 체인
  if (params.tokenAddress) {
    return sendERC20Transaction(params);
  } else {
    return sendNativeTransaction(params);
  }
}