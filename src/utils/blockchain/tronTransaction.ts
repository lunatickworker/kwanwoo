import { TronWeb } from 'tronweb';

/**
 * Tron 네트워크 트랜잭션 처리
 */

interface TronTransactionParams {
  privateKey: string;
  toAddress: string;
  tokenAddress: string | null; // null이면 TRX, 아니면 TRC-20
  amount: string;
  decimals: number;
  fullNode: string;
  solidityNode?: string;
  eventServer?: string;
}

interface TronTransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

interface TronGasEstimate {
  bandwidth: number;
  energy: number;
  estimatedCost: string; // TRX 단위
}

interface TronWallet {
  address: string; // Base58 형식 (T로 시작)
  privateKey: string;
  hexAddress: string; // Hex 형식 (0x...)
}

/**
 * 새로운 Tron 지갑 생성
 */
export function createTronWallet(): TronWallet {
  try {
    const tronWeb = createTronWebInstance('api.trongrid.io');
    
    // 새 계정 생성
    const account = tronWeb.createAccount();
    
    // Private key에서 '0x' 제거
    const privateKey = account.privateKey.startsWith('0x') 
      ? account.privateKey.slice(2) 
      : account.privateKey;
    
    console.log('✅ Tron 지갑 생성 완료:', {
      address: account.address.base58,
      hexAddress: account.address.hex
    });
    
    return {
      address: account.address.base58, // T로 시작하는 Base58 주소
      privateKey: privateKey,
      hexAddress: account.address.hex // 0x로 시작하는 Hex 주소
    };
  } catch (error) {
    console.error('❌ Tron 지갑 생성 실패:', error);
    throw error;
  }
}

/**
 * Private Key로부터 Tron 지갑 복구
 */
export function recoverTronWallet(privateKey: string): TronWallet | null {
  try {
    // Private key 정규화 (0x 제거)
    const cleanPrivateKey = privateKey.startsWith('0x') 
      ? privateKey.slice(2) 
      : privateKey;
    
    const tronWeb = createTronWebInstance('api.trongrid.io', cleanPrivateKey);
    
    // Private key로부터 주소 유도
    const address = tronWeb.address.fromPrivateKey(cleanPrivateKey);
    const hexAddress = tronWeb.address.toHex(address);
    
    console.log('✅ Tron 지갑 복구 완료:', { address, hexAddress });
    
    return {
      address,
      privateKey: cleanPrivateKey,
      hexAddress
    };
  } catch (error) {
    console.error('❌ Tron 지갑 복구 실패:', error);
    return null;
  }
}

/**
 * TronWeb 인스턴스 생성
 */
function createTronWebInstance(fullNode: string, privateKey?: string): any {
  // fullNode에서 프로토콜 제거 (TronWeb이 자동으로 추가함)
  const cleanUrl = fullNode.replace(/^https?:\/\//, '');
  const httpProvider = `https://${cleanUrl}`;

  const tronWeb = new TronWeb({
    fullHost: httpProvider,
    privateKey: privateKey || undefined
  });

  return tronWeb;
}

/**
 * Tron 주소 유효성 검사
 */
export function isValidTronAddress(address: string): boolean {
  // Tron 주소는 T로 시작하고 34자
  if (!address || address.length !== 34 || !address.startsWith('T')) {
    return false;
  }
  
  try {
    const tronWeb = createTronWebInstance('api.trongrid.io');
    return tronWeb.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * TRC-20 토큰 전송
 */
export async function sendTRC20Transaction(
  params: TronTransactionParams
): Promise<TronTransactionResult> {
  const { privateKey, toAddress, tokenAddress, amount, decimals, fullNode } = params;

  try {
    if (!tokenAddress) {
      throw new Error('TRC-20 토큰 주소가 필요합니다');
    }

    console.log('🔄 TRC-20 전송 시작:', {
      to: toAddress,
      token: tokenAddress,
      amount,
      network: fullNode
    });

    // TronWeb 인스턴스 생성
    const tronWeb = createTronWebInstance(fullNode, privateKey);

    // 금액을 Sun 단위로 변환 (Tron의 최소 단위)
    const amountInSun = parseFloat(amount) * Math.pow(10, decimals);

    // TRC-20 컨트랙트 인스턴스 생성
    const contract = await tronWeb.contract().at(tokenAddress);

    // Transfer 함수 매개변수
    const parameter = [
      { type: 'address', value: toAddress },
      { type: 'uint256', value: amountInSun.toString() }
    ];

    // 트랜잭션 전송
    const tx = await contract.transfer(toAddress, amountInSun.toString()).send({
      feeLimit: 100_000_000, // 100 TRX (수수료 한도)
      callValue: 0,
      shouldPollResponse: true
    });

    console.log('📤 TRC-20 트랜잭션 전송됨:', tx);

    // txid 추출
    const txHash = typeof tx === 'string' ? tx : tx.txid || tx.transaction?.txID;

    if (!txHash) {
      throw new Error('트랜잭션 ID를 찾을 수 없습니다');
    }

    console.log('✅ TRC-20 트랜잭션 확인됨:', txHash);

    return {
      success: true,
      txHash: txHash
    };

  } catch (error: any) {
    console.error('❌ TRC-20 전송 실패:', error);
    return {
      success: false,
      error: error.message || 'TRC-20 트랜잭션 전송 실패'
    };
  }
}

/**
 * TRX (네이티브 토큰) 전송
 */
export async function sendTRXTransaction(
  params: TronTransactionParams
): Promise<TronTransactionResult> {
  const { privateKey, toAddress, amount, decimals, fullNode } = params;

  try {
    console.log('🔄 TRX 전송 시작:', {
      to: toAddress,
      amount,
      network: fullNode
    });

    // TronWeb 인스턴스 생성
    const tronWeb = createTronWebInstance(fullNode, privateKey);

    // 금액을 Sun 단위로 변환 (1 TRX = 1,000,000 SUN)
    const amountInSun = parseFloat(amount) * Math.pow(10, decimals);

    // TRX 전송 트랜잭션 생성
    const tx = await tronWeb.trx.sendTransaction(toAddress, amountInSun);

    console.log('📤 TRX 트랜잭션 전송됨:', tx);

    const txHash = tx.txid || tx.transaction?.txID;

    if (!txHash) {
      throw new Error('트랜잭션 ID를 찾을 수 없습니다');
    }

    console.log('✅ TRX 트랜잭션 확인됨:', txHash);

    return {
      success: true,
      txHash: txHash
    };

  } catch (error: any) {
    console.error('❌ TRX 전송 실패:', error);
    return {
      success: false,
      error: error.message || 'TRX 트랜잭션 전송 실패'
    };
  }
}

/**
 * Tron 지갑 잔액 조회
 */
export async function getTronWalletBalance(
  address: string,
  tokenAddress: string | null,
  fullNode: string,
  decimals: number = 6
): Promise<{ balance: string; balanceInSun: string } | null> {
  try {
    const tronWeb = createTronWebInstance(fullNode);

    if (tokenAddress) {
      // TRC-20 토큰 잔액 조회
      const contract = await tronWeb.contract().at(tokenAddress);
      const balanceInSun = await contract.balanceOf(address).call();
      
      // BigNumber를 문자열로 변환
      const balanceStr = balanceInSun.toString();
      const balance = (parseFloat(balanceStr) / Math.pow(10, decimals)).toString();

      console.log('💰 TRC-20 잔액:', balance, '(', balanceStr, 'SUN)');

      return {
        balance,
        balanceInSun: balanceStr
      };
    } else {
      // TRX 잔액 조회
      const balanceInSun = await tronWeb.trx.getBalance(address);
      const balance = (balanceInSun / Math.pow(10, decimals)).toString();

      console.log('💰 TRX 잔액:', balance, '(', balanceInSun, 'SUN)');

      return {
        balance,
        balanceInSun: balanceInSun.toString()
      };
    }
  } catch (error: any) {
    console.error('❌ Tron 잔액 조회 실패:', error);
    return null;
  }
}

/**
 * Tron 가스비(에너지/대역폭) 추정
 */
export async function estimateTronGas(
  toAddress: string,
  tokenAddress: string | null,
  amount: string,
  decimals: number,
  fullNode: string
): Promise<TronGasEstimate | null> {
  try {
    const tronWeb = createTronWebInstance(fullNode);

    if (tokenAddress) {
      // TRC-20 트랜잭션은 대략적인 에너지 소비
      // transfer 함수 호출: 약 15,000 - 30,000 에너지
      const estimatedEnergy = 25000;
      const estimatedBandwidth = 345; // 트랜잭션 크기에 따라

      // 에너지 가격: 약 420 SUN/Energy (변동 가능)
      const energyPrice = 420;
      const estimatedCostInSun = estimatedEnergy * energyPrice;
      const estimatedCost = (estimatedCostInSun / 1_000_000).toString(); // TRX 단위

      console.log('⛽ TRC-20 가스비 추정:', {
        energy: estimatedEnergy,
        bandwidth: estimatedBandwidth,
        cost: estimatedCost + ' TRX'
      });

      return {
        bandwidth: estimatedBandwidth,
        energy: estimatedEnergy,
        estimatedCost
      };
    } else {
      // TRX 전송은 대역폭만 소비
      const estimatedBandwidth = 268; // 일반 TRX 전송
      
      // 대역폭은 무료 할당량이 있어 대부분 무료
      // 초과 시 1 TRX = 1000 대역폭
      const estimatedCost = '0.001'; // 대략적인 값

      console.log('⛽ TRX 가스비 추정:', {
        bandwidth: estimatedBandwidth,
        cost: estimatedCost + ' TRX'
      });

      return {
        bandwidth: estimatedBandwidth,
        energy: 0,
        estimatedCost
      };
    }
  } catch (error: any) {
    console.error('❌ Tron 가스비 추정 실패:', error);
    return null;
  }
}

/**
 * 통합 Tron 트랜잭션 전송 함수
 */
export async function sendTronTransaction(
  params: TronTransactionParams
): Promise<TronTransactionResult> {
  if (params.tokenAddress) {
    return sendTRC20Transaction(params);
  } else {
    return sendTRXTransaction(params);
  }
}

/**
 * Hex 주소를 Tron Base58 주소로 변환
 */
export function hexToTronAddress(hexAddress: string): string | null {
  try {
    // 0x 접두사 제거
    const cleanHex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
    
    // 41 접두사 추가 (Tron 메인넷)
    const tronHex = '41' + cleanHex;
    
    const tronWeb = createTronWebInstance('api.trongrid.io');
    const base58Address = tronWeb.address.fromHex(tronHex);
    
    return base58Address;
  } catch (error) {
    console.error('❌ Hex to Tron 주소 변환 실패:', error);
    return null;
  }
}

/**
 * Tron Base58 주소를 Hex로 변환
 */
export function tronAddressToHex(base58Address: string): string | null {
  try {
    const tronWeb = createTronWebInstance('api.trongrid.io');
    const hexAddress = tronWeb.address.toHex(base58Address);
    
    // 41 접두사 제거하고 0x 추가
    const cleanHex = hexAddress.startsWith('41') ? hexAddress.slice(2) : hexAddress;
    
    return '0x' + cleanHex;
  } catch (error) {
    console.error('❌ Tron to Hex 주소 변환 실패:', error);
    return null;
  }
}