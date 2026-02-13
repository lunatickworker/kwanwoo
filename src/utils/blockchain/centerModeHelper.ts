import { supabase } from '../supabase/client';
import { sendTransaction, estimateGas, getWalletBalance } from './transaction';
import { toast } from 'sonner@2.0.3';
import { SUPABASE_CONFIG } from '../config';

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
  centerId?: string;
  toAddress: string;
  coinType?: string;
  amount: string;
  adminId?: string;
  storeId?: string; // OFF일 때 가맹점의 가스비 확인용
  gasSponsorEnabled?: boolean; // true: 센터가 가스비 지원, false: 가맹점이 가스비 부담
  [key: string]: any; // 기타 프로퍼티
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

    // 1. 관리자 지갑 조회 (존재 여부만 확인)
    const { data: adminWalletData, error: walletError } = await supabase
      .from('wallets')
      .select('wallet_id, address, balance')
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

    console.log('✅ 관리자 지갑 확인됨');

    // 2. 백엔드 트랜잭션 API 호출 (모든 로직을 백엔드에서 처리)
    console.log('📤 백엔드 트랜잭션 API 호출');
    
    try {
      // SDK의 invoke() 메소드 대신 fetch로 직접 호출하여 에러 응답 파싱
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const backendUrl = `${SUPABASE_CONFIG.FUNCTIONS_BASE_URL}/make-server-b6d5667f/transaction/send`;
      
      // Authorization 헤더에 API key를 Bearer token으로 사용 (accessToken이 없으면 API key 사용)
      const authHeader = accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_CONFIG.anonKey}`;
      
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          fromWalletId: adminWalletData.wallet_id,
          fromUserId: adminId,
          toAddress: toAddress,
          amount: amount.toString(),
          coinType: coinType,
          centerId: centerId
        })
      });

      console.log('📬 백엔드 응답 상태:', response.status);
      
      const result = await response.json();
      console.log('📬 백엔드 응답:', result);

      if (!response.ok) {
        console.error(`❌ API 호출 실패 (${response.status}):`, result);
        return {
          success: false,
          error: result?.error || `트랜잭션 실패: ${response.statusText}`
        };
      }

      if (!result?.success) {
        const errorMsg = result?.error || '트랜잭션 전송 실패';
        const errorDetail = result?.details ? ` (${result.details})` : '';
        console.error('❌ 백엔드 에러:', errorMsg + errorDetail);
        return {
          success: false,
          error: errorMsg + errorDetail
        };
      }

      console.log('✅ 트랜잭션 결과:', result);

      return {
        success: true,
        txHash: result.txHash
      };
    } catch (error: any) {
      console.error('❌ API 호출 예외:', error);
      return {
        success: false,
        error: `트랜잭션 처리 실패: ${error.message}`
      };
    }
  } catch (error: any) {
    console.error('❌ 트랜잭션 실패:', error);
    return {
      success: false,
      error: `트랜잭션 처리 실패: ${error.message}`
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