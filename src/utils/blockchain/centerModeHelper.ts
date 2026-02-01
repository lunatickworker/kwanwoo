import { supabase } from '../supabase/client';
import { sendTransaction, estimateGas, getWalletBalance } from './transaction';
import { toast } from 'sonner@2.0.3';

/**
 * 센터의 운영 모드 조회
 */
export async function getCenterOperationMode(userId: string): Promise<'development' | 'production'> {
  try {
    // 사용자의 metadata에서 operation_mode 조회
    const { data: userData } = await supabase
      .from('users')
      .select('metadata')
      .eq('user_id', userId)
      .single();

    if (!userData?.metadata) {
      console.log('⚠️ metadata를 찾을 수 없음. 개발 모드로 설정');
      return 'development';
    }

    return userData.metadata.operation_mode || 'development';
  } catch (error) {
    console.error('❌ 센터 운영 모드 조회 실패:', error);
    return 'development';
  }
}

interface BlockchainTransactionParams {
  centerId: string;
  toAddress: string;
  coinType: string;
  amount: string;
  adminId: string;
}

interface BlockchainTransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  gasEstimate?: {
    estimatedCost: string;
    token: string;
  };
}

/**
 * 프로덕션 모드에서 실제 블록체인 트랜잭션 전송
 */
export async function sendProductionTransaction(
  params: BlockchainTransactionParams
): Promise<BlockchainTransactionResult> {
  const { centerId, toAddress, coinType, amount, adminId } = params;

  try {
    console.log('🔄 프로덕션 모드 트랜잭션 시작:', params);

    // 1. 관리자 지갑 조회 (wallets 테이블에서)
    const { data: adminWalletData, error: walletError } = await supabase
      .from('wallets')
      .select('wallet_id, address, balance, encrypted_private_key')
      .eq('user_id', adminId)
      .eq('coin_type', coinType)
      .eq('status', 'active')
      .single();

    if (walletError || !adminWalletData) {
      return {
        success: false,
        error: '관리자 지갑을 찾을 수 없습니다'
      };
    }

    if (!adminWalletData.encrypted_private_key) {
      return {
        success: false,
        error: '지갑의 Private Key가 없습니다. 지갑을 다시 생성해주세요.'
      };
    }

    const fromAddress = adminWalletData.address;
    const privateKey = adminWalletData.encrypted_private_key;

    // 2. 토큰 정보 조회
    const { data: tokenData, error: tokenError } = await supabase
      .from('supported_tokens')
      .select('contract_address, decimals, chain_id, rpc_url, network')
      .eq('symbol', coinType)
      .single();

    if (tokenError || !tokenData) {
      return {
        success: false,
        error: `토큰 정보를 찾을 수 없습니다: ${coinType}`
      };
    }

    // 3. 잔액 확인
    const requiredAmount = parseFloat(amount);
    const availableAmount = parseFloat(adminWalletData.balance);

    if (availableAmount < requiredAmount) {
      return {
        success: false,
        error: `토큰 잔액 부족\n필요: ${requiredAmount} ${coinType}\n보유: ${availableAmount} ${coinType}\n부족: ${requiredAmount - availableAmount} ${coinType}`
      };
    }

    // 4. 가스비 추정
    console.log('⛽ 가스비 추정 중...');
    const gasEstimate = await estimateGas({
      toAddress,
      tokenAddress: tokenData.contract_address,
      amount,
      decimals: tokenData.decimals || 18,
      rpcUrl: tokenData.rpc_url,
      chainId: tokenData.chain_id
    });

    if (!gasEstimate) {
      return {
        success: false,
        error: '가스비 추정에 실패했습니다'
      };
    }

    console.log('⛽ 예상 가스비:', gasEstimate.estimatedCost, getNetworkToken(tokenData.network));

    // 5. 네이티브 토큰 잔액 확인 (가스비용)
    const nativeBalance = await getWalletBalance(
      fromAddress,
      null, // 네이티브 토큰
      tokenData.rpc_url,
      tokenData.chain_id,
      18
    );

    if (!nativeBalance) {
      return {
        success: false,
        error: '네이티브 토큰 잔액 조회에 실패했습니다'
      };
    }

    const requiredGas = parseFloat(gasEstimate.estimatedCost);
    const availableGas = parseFloat(nativeBalance.balance);

    if (availableGas < requiredGas) {
      return {
        success: false,
        error: `가스비 부족\n필요: ${requiredGas} ${getNetworkToken(tokenData.network)}\n보유: ${availableGas} ${getNetworkToken(tokenData.network)}\n부족: ${requiredGas - availableGas} ${getNetworkToken(tokenData.network)}`,
        gasEstimate: {
          estimatedCost: gasEstimate.estimatedCost,
          token: getNetworkToken(tokenData.network)
        }
      };
    }

    // 6. 트랜잭션 전송
    console.log('📤 블록체인 트랜잭션 전송 중...');
    toast.info('블록체인 트랜잭션을 전송하는 중입니다...');

    const result = await sendTransaction({
      privateKey,
      toAddress,
      tokenAddress: tokenData.contract_address,
      amount,
      decimals: tokenData.decimals || 18,
      rpcUrl: tokenData.rpc_url,
      chainId: tokenData.chain_id
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || '트랜잭션 전송에 실패했습니다'
      };
    }

    // 7. wallets 테이블의 잔액 차감
    const newBalance = availableAmount - requiredAmount;
    await supabase
      .from('wallets')
      .update({ balance: newBalance.toString() })
      .eq('wallet_id', adminWalletData.wallet_id);

    console.log('✅ 트랜잭션 성공:', result.txHash);
    console.log('✅ 잔액 차감 완료:', availableAmount, '→', newBalance);
    toast.success(`트랜잭션 성공! TX: ${result.txHash?.substring(0, 10)}...`);

    return {
      success: true,
      txHash: result.txHash,
      gasEstimate: {
        estimatedCost: gasEstimate.estimatedCost,
        token: getNetworkToken(tokenData.network)
      }
    };

  } catch (error: any) {
    console.error('❌ 프로덕션 트랜잭션 실패:', error);
    return {
      success: false,
      error: error.message || '트랜잭션 처리 중 오류가 발생했습니다'
    };
  }
}

/**
 * 네트워크 이름으로 네이티브 토큰 심볼 반환
 */
function getNetworkToken(network: string): string {
  const networkTokens: Record<string, string> = {
    'ethereum': 'ETH',
    'polygon': 'MATIC',
    'base': 'ETH',
    'arbitrum': 'ETH',
    'optimism': 'ETH',
    'bsc': 'BNB',
    'avalanche': 'AVAX',
    'tron': 'TRX',
  };

  return networkTokens[network.toLowerCase()] || 'ETH';
}

/**
 * 개발 모드에서 가짜 txHash 생성
 */
export function generateDevTxHash(): string {
  const randomHex = () => Math.floor(Math.random() * 16).toString(16);
  const hash = '0x' + Array.from({ length: 64 }, randomHex).join('');
  return hash;
}