import { supabase } from './supabase/client';
import { SUPABASE_CONFIG } from './config';

type WithdrawalType = 'user' | 'admin';
type AdminRole = 'master' | 'center' | 'agency' | 'store';

interface BaseWithdrawalParams {
  coinType: string;
  amount: number;
  toAddress: string;
}

interface UserWithdrawalParams extends BaseWithdrawalParams {
  withdrawalType: 'user';
  userId: string;
  walletId: string;
}

interface AdminWithdrawalParams extends BaseWithdrawalParams {
  withdrawalType: 'admin';
  adminId: string;
  adminRole: AdminRole;
  walletId: string;
}

type WithdrawalParams = UserWithdrawalParams | AdminWithdrawalParams;

interface WithdrawalResult {
  success: boolean;
  txHash?: string;
  withdrawalId?: string;
  error?: string;
}

/**
 * 통합 출금 처리 (사용자/관리자)
 * 백엔드 Edge Function으로 위임
 */
export async function executeWithdrawal(params: WithdrawalParams): Promise<WithdrawalResult> {
  try {
    const { coinType, amount, toAddress } = params;
    const isAdmin = params.withdrawalType === 'admin';
    const userId = isAdmin ? (params as AdminWithdrawalParams).adminId : (params as UserWithdrawalParams).userId;
    const walletId = params.walletId;

    console.log(`🔄 ${isAdmin ? '관리자' : '사용자'} 출금 시작:`, { userId, walletId, coinType, amount, toAddress });

    // 1. 지갑 존재 여부 확인
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('wallet_id, user_id, coin_type, balance')
      .eq('wallet_id', walletId)
      .single();

    if (walletError || !wallet) {
      return { success: false, error: '지갑을 찾을 수 없습니다' };
    }

    console.log('✅ 지갑 확인됨');

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
          fromWalletId: walletId,
          fromUserId: userId,
          toAddress: toAddress,
          amount: amount.toString(),
          coinType: coinType
        })
      });

      console.log('📬 백엔드 응답 상태:', response.status);
      
      const result = await response.json();
      console.log('📬 백엔드 응답:', result);

      if (!response.ok) {
        console.error(`❌ API 호출 실패 (${response.status}):`, result);
        return {
          success: false,
          error: result?.error || `출금 실패: ${response.statusText}`
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
        txHash: result.txHash,
        withdrawalId: result.withdrawalId
      };
    } catch (error: any) {
      console.error('❌ API 호출 예외:', error);
      return { 
        success: false, 
        error: `출금 실패: ${error.message}` 
      };
    }

  } catch (error: any) {
    console.error('❌ 출금 실패:', error);
    return {
      success: false,
      error: `출금 처리 실패: ${error.message}`
    };
  }
}

/**
 * 출금 가능 여부 확인
 */
export async function canUserWithdraw(userId: string): Promise<boolean> {
  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('gas_sponsor_enabled')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('사용자 정보 조회 실패:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('출금 가능 여부 확인 실패:', error);
    return false;
  }
}

/**
 * 출금 수수료 추정
 */
export async function estimateWithdrawalFee(
  coinType: string,
  network: string
): Promise<number> {
  try {
    const { data: coinData } = await supabase
      .from('supported_tokens')
      .select('*')
      .eq('symbol', coinType)
      .single();

    if (!coinData) {
      return 0;
    }

    if (network?.toLowerCase() === 'tron' || coinData.rpc_url?.includes('trongrid')) {
      return 0.268;
    }

    return 0.005;
  } catch (error) {
    console.error('출금 수수료 추정 실패:', error);
    return 0;
  }
}

/**
 * 이전 버전 호환성: executeUserWithdrawal
 * @deprecated executeWithdrawal 사용 권장
 */
export async function executeUserWithdrawal(params: {
  userId: string;
  walletId: string;
  coinType: string;
  amount: number;
  toAddress: string;
}): Promise<WithdrawalResult> {
  return executeWithdrawal({
    withdrawalType: 'user',
    ...params
  });
}

