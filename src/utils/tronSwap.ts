import { supabase } from './supabase/client';


interface SwapParams {
  userId: string;
  fromCoin: string;
  toCoin: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  fee: number;
  fromWalletAddress: string;
  toWalletAddress: string;
}

interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
  status: 'completed' | 'failed' | 'processing';
}

/**
 * TRON 네트워크에서 실제 스왑 처리 (비동기)
 * Supabase Edge Function Backend에서 안전하게 개인키 복호화 + 서명 실행
 * 
 * 동작:
 * 1. Backend에 스왑 요청 (즉시 반환, 202 Accepted)
 * 2. Backend는 백그라운드에서 비동기로 처리
 * 3. Frontend는 폴링을 통해 상태 확인 (최대 60초)
 */
export async function executeTronSwap(params: SwapParams): Promise<SwapResult> {
  const {
    userId,
    fromCoin,
    toCoin,
    fromAmount,
    toAmount,
    exchangeRate,
    fee
  } = params;

  try {
    console.log(`🔄 [TRON Swap] 시작: ${fromAmount} ${fromCoin} -> ${toAmount} ${toCoin}`);

    // Step 1: Backend에 스왑 요청 (비동기)
    const { data, error } = await supabase.functions.invoke('make-server-b6d5667f', {
      body: {
        endpoint: '/swap/tron',
        userId,
        fromCoin,
        toCoin,
        fromAmount,
        toAmount,
        exchangeRate,
        fee
      }
    });

    if (error) {
      console.error('❌ Backend 호출 에러:', error);
      throw new Error(`Backend 호출 실패: ${error.message}`);
    }

    if (!data?.success) {
      throw new Error(data?.error || '스왑 요청 실패');
    }

    const swapId = data.swap_id;
    console.log(`⏳ [TRON Swap] 처리 시작 (ID: ${swapId})...`);

    // Step 2: Backend가 처리할 때까지 폴링 (최대 60초)
    const txHash = await pollSwapStatus(swapId, userId);

    if (!txHash) {
      throw new Error('스왑 처리 시간 초과');
    }

    console.log(`✅ [TRON Swap] 완료: ${txHash}`);
    console.log(`🔗 TronScan: https://tronscan.org/#/transaction/${txHash}`);

    return {
      success: true,
      txHash,
      status: 'completed'
    };

  } catch (error: any) {
    console.error('❌ [TRON Swap] 실패:', error.message);

    return {
      success: false,
      error: error.message,
      status: 'failed'
    };
  }
}

/**
 * 백그라운드 스왑 처리 상태 폴링 (최대 60초)
 */
export async function pollSwapStatus(
  swapId: string,
  userId: string,
  maxWaitSeconds: number = 60
): Promise<string | null> {
  const pollIntervalMs = 2000; // 2초마다 폴링
  const maxAttempts = maxWaitSeconds / (pollIntervalMs / 1000);
  let attempts = 0;

  return new Promise((resolve) => {
    const poll = async () => {
      try {
        attempts++;
        
        if (attempts > maxAttempts) {
          console.warn(`⏱️ 폴링 타임아웃: ${maxWaitSeconds}초`);
          resolve(null);
          return;
        }

        // DB에서 스왑 상태 조회
        const { data: swapRecord, error } = await supabase
          .from('coin_swaps')
          .select('swap_id, status, tx_hash')
          .eq('swap_id', swapId)
          .eq('user_id', userId)
          .single();

        if (error) {
          console.warn(`⚠️ 상태 조회 실패 (attempt ${attempts}):`, error.message);
          setTimeout(poll, pollIntervalMs);
          return;
        }

        if (!swapRecord) {
          console.warn(`⚠️ 스왑 기록 없음 (attempt ${attempts})`);
          setTimeout(poll, pollIntervalMs);
          return;
        }

        console.log(`📊 [폴링] 상태: ${swapRecord.status} (attempt ${attempts}/${Math.ceil(maxAttempts)})`);

        // 완료 또는 실패 상태 확인
        if (swapRecord.status === 'completed') {
          console.log(`✅ 스왑 완료: ${swapRecord.tx_hash}`);
          resolve(swapRecord.tx_hash);
          return;
        }

        if (swapRecord.status === 'failed') {
          console.error(`❌ 스왑 실패`);
          resolve(null);
          return;
        }

        // 처리 중인 경우 다시 폴링
        setTimeout(poll, pollIntervalMs);

      } catch (error) {
        console.error(`⚠️ 폴링 중 오류:`, error);
        setTimeout(poll, pollIntervalMs);
      }
    };

    poll();
  });
}

/**
 * 현재 사용자의 인증 토큰 가져오기
 */
async function getAuthToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('인증 토큰을 가져올 수 없습니다');
  }
  return session.access_token;
}

/**
 * 트랜잭션 상태 확인
 */
export async function checkTransactionStatus(txHash: string): Promise<{
  status: 'success' | 'failed' | 'pending';
  confirmations: number;
  blockNumber: number;
}> {
  try {
    const tronweb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      headers: { "TRON-PRO-API-KEY": process.env.REACT_APP_TRON_API_KEY }
    });

    const transaction = await tronweb.trx.getTransaction(txHash);

    if (!transaction) {
      return {
        status: 'pending',
        confirmations: 0,
        blockNumber: 0
      };
    }

    return {
      status: transaction.ret?.[0]?.contractRet === 'SUCCESS' ? 'success' : 'failed',
      confirmations: transaction.blockNumber ? 1 : 0,
      blockNumber: transaction.blockNumber || 0
    };
  } catch (error) {
    console.error('트랜잭션 상태 조회 실패:', error);
    return {
      status: 'pending',
      confirmations: 0,
      blockNumber: 0
    };
  }
}
