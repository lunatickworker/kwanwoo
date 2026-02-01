import { ethers } from 'ethers';
import { createTronWallet, recoverTronWallet } from './tronTransaction';

/**
 * 통합 지갑 생성 유틸리티
 * EVM 체인과 Tron 체인을 모두 지원
 */

export interface WalletInfo {
  address: string;
  privateKey: string;
  network: string;
}

/**
 * 네트워크에 따라 새 지갑 생성
 * @param network - 'ethereum', 'polygon', 'base', 'tron' 등
 * @returns 지갑 정보 (주소, private key)
 */
export function generateWallet(network: string): WalletInfo {
  const normalizedNetwork = network.toLowerCase();

  // Tron 네트워크 감지
  if (normalizedNetwork === 'tron' || normalizedNetwork.includes('tron')) {
    console.log('🔶 Tron 지갑 생성');
    const tronWallet = createTronWallet();
    
    return {
      address: tronWallet.address, // Base58 형식
      privateKey: tronWallet.privateKey,
      network: 'tron'
    };
  }

  // EVM 체인 (Ethereum, Polygon, BSC, Base, Arbitrum 등)
  console.log('⚡ EVM 지갑 생성');
  const wallet = ethers.Wallet.createRandom();

  return {
    address: wallet.address, // 0x... 형식
    privateKey: wallet.privateKey.replace('0x', ''), // 0x 제거
    network: normalizedNetwork
  };
}

/**
 * Private Key로부터 지갑 복구
 * @param privateKey - Private key (0x 접두사 있어도 됨)
 * @param network - 'ethereum', 'polygon', 'base', 'tron' 등
 * @returns 지갑 정보 또는 null
 */
export function recoverWallet(privateKey: string, network: string): WalletInfo | null {
  try {
    const normalizedNetwork = network.toLowerCase();
    
    // Private key 정규화
    const cleanPrivateKey = privateKey.startsWith('0x') 
      ? privateKey.slice(2) 
      : privateKey;

    // Tron 네트워크
    if (normalizedNetwork === 'tron' || normalizedNetwork.includes('tron')) {
      console.log('🔶 Tron 지갑 복구');
      const tronWallet = recoverTronWallet(cleanPrivateKey);
      
      if (!tronWallet) {
        return null;
      }
      
      return {
        address: tronWallet.address,
        privateKey: tronWallet.privateKey,
        network: 'tron'
      };
    }

    // EVM 체인
    console.log('⚡ EVM 지갑 복구');
    const wallet = new ethers.Wallet('0x' + cleanPrivateKey);

    return {
      address: wallet.address,
      privateKey: cleanPrivateKey,
      network: normalizedNetwork
    };
  } catch (error) {
    console.error('❌ 지갑 복구 실패:', error);
    return null;
  }
}

/**
 * 주소가 특정 네트워크에 유효한지 검증
 * @param address - 지갑 주소
 * @param network - 네트워크 이름
 * @returns 유효성 여부
 */
export function isValidAddress(address: string, network: string): boolean {
  const normalizedNetwork = network.toLowerCase();

  // Tron 네트워크
  if (normalizedNetwork === 'tron' || normalizedNetwork.includes('tron')) {
    // Tron 주소는 T로 시작하고 34자
    return address.length === 34 && address.startsWith('T');
  }

  // EVM 체인
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * 네트워크 타입 감지
 * @param rpcUrl - RPC URL
 * @returns 'evm' | 'tron'
 */
export function detectNetworkType(rpcUrl: string): 'evm' | 'tron' {
  if (rpcUrl.includes('trongrid.io') || rpcUrl.includes('tronapi')) {
    return 'tron';
  }
  return 'evm';
}

/**
 * 지갑 주소 형식 변환 (필요시)
 * Tron: Base58 ↔ Hex
 * EVM: 항상 0x... 형식
 */
export function formatAddress(address: string, network: string, format: 'display' | 'storage' = 'display'): string {
  const normalizedNetwork = network.toLowerCase();

  // Tron 네트워크
  if (normalizedNetwork === 'tron' || normalizedNetwork.includes('tron')) {
    // Tron은 항상 Base58 형식으로 표시
    return address;
  }

  // EVM 체인 - checksum 적용
  try {
    return ethers.getAddress(address); // Checksum 적용된 주소 반환
  } catch {
    return address;
  }
}
