import { supabase } from './supabase/client';
import { sendTransaction, estimateGas, getWalletBalance } from './blockchain/transaction';
import { sendTronTransaction, estimateTronGas } from './blockchain/tronTransaction';

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
 * - 사용자와 관리자 모두 사용
 * - 블록체인 로직은 동일
 * - 테이블과 상태 관리만 다름
 */
export async function executeWithdrawal(params: WithdrawalParams): Promise<WithdrawalResult> {
  try {
    const { coinType, amount, toAddress } = params;
    const isAdmin = params.withdrawalType === 'admin';
    const userId = isAdmin ? (params as AdminWithdrawalParams).adminId : (params as UserWithdrawalParams).userId;
    const walletId = params.walletId;

    console.log(`🔄 ${isAdmin ? '관리자' : '사용자'} 출금 시작:`, { userId, walletId, coinType, amount, toAddress });

    // 1. 지갑 정보 조회
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('wallet_id', walletId)
      .single();

    if (walletError || !wallet) {
      return { success: false, error: '지갑을 찾을 수 없습니다' };
    }

    // 2. 잔액 확인
    const walletBalance = parseFloat(wallet.balance);
    if (walletBalance < amount) {
      return {
        success: false,
        error: `잔액 부족\n필요: ${amount} ${coinType}\n보유: ${walletBalance} ${coinType}`
      };
    }

    // 3. 코인 정보 조회
    const { data: coinData, error: coinError } = await supabase
      .from('supported_tokens')
      .select('*')
      .eq('symbol', coinType)
      .single();

    if (coinError || !coinData) {
      return { success: false, error: `코인 정보를 찾을 수 없습니다: ${coinType}` };
    }

    // 4. 개인키 확인
    const privateKey = wallet.encrypted_private_key;
    if (!privateKey) {
      return { success: false, error: '지갑의 개인키가 없습니다' };
    }

    let txHash: string;
    let gasFee = 0;

    // 5. 트랜잭션 전송
    if (coinData.network?.toLowerCase() === 'tron' || coinData.rpc_url?.includes('trongrid')) {
      console.log('🔵 TRON 네트워크 출금');
      
      // 가스비 동적 계산
      const gasEstimate = await estimateTronGas(
        toAddress,
        coinData.contract_address || null,
        amount.toString(),
        coinData.decimals || 6,
        coinData.rpc_url
      );
      gasFee = parseFloat(gasEstimate?.estimatedCost || '0.01');

      const result = await sendTronTransaction({
        privateKey,
        toAddress,
        tokenAddress: coinData.contract_address || null,
        amount: amount.toString(),
        decimals: coinData.decimals || 6,
        fullNode: coinData.rpc_url
      });

      if (!result.success) {
        return { success: false, error: result.error || 'TRON 트랜잭션 전송 실패' };
      }

      txHash = result.txHash!;
    } else {
      console.log('🟢 EVM 네트워크 출금');

      // 가스비 동적 계산
      const gasEstimate = await estimateGas({
        toAddress,
        tokenAddress: coinData.contract_address || null,
        amount: amount.toString(),
        decimals: coinData.decimals || 18,
        rpcUrl: coinData.rpc_url,
        chainId: coinData.chain_id || 1
      });

      if (!gasEstimate) {
        return { success: false, error: '가스비 추정에 실패했습니다' };
      }

      gasFee = parseFloat(gasEstimate.estimatedCost);

      // 네이티브 토큰(가스비) 잔액 확인
      const nativeBalance = await getWalletBalance(
        wallet.address,
        null,
        coinData.rpc_url,
        coinData.chain_id || 1,
        18
      );

      if (!nativeBalance || parseFloat(nativeBalance.balance) < gasFee) {
        return {
          success: false,
          error: `가스비 부족\n필요: ${gasFee} ${getNetworkToken(coinData.network)}\n보유: ${nativeBalance?.balance || '0'} ${getNetworkToken(coinData.network)}`
        };
      }

      // EVM 트랜잭션 전송
      const result = await sendTransaction({
        privateKey,
        toAddress,
        tokenAddress: coinData.contract_address || null,
        amount: amount.toString(),
        decimals: coinData.decimals || 18,
        rpcUrl: coinData.rpc_url,
        chainId: coinData.chain_id || 1
      });

      if (!result.success) {
        return { success: false, error: result.error || 'EVM 트랜잭션 전송 실패' };
      }

      txHash = result.txHash!;
    }

    // 6. 지갑 잔액 차감
    const newBalance = walletBalance - amount - gasFee;
    await supabase
      .from('wallets')
      .update({ balance: Math.max(0, newBalance).toString() })
      .eq('wallet_id', walletId);

    // 7. 출금 기록
    let withdrawalId = '';
    
    if (isAdmin) {
      // 관리자: admin_coin_withdrawals 테이블
      const { data: adminWithdrawalData, error: adminInsertError } = await supabase
        .from('admin_coin_withdrawals')
        .insert({
          admin_id: userId,
          admin_role: (params as AdminWithdrawalParams).adminRole,
          coin_type: coinType,
          amount: amount,
          gas_fee: gasFee,
          from_address: wallet.address,
          to_address: toAddress,
          tx_hash: txHash,
          status: 'completed',
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (adminInsertError) {
        console.error('⚠️ admin_coin_withdrawals 기록 저장 실패:', adminInsertError);
      } else {
        withdrawalId = adminWithdrawalData?.id || '';
      }
    } else {
      // 사용자: withdrawals 테이블
      const { data: userWithdrawalData, error: userInsertError } = await supabase
        .from('withdrawals')
        .insert({
          user_id: userId,
          wallet_id: walletId,
          coin_type: coinType,
          amount: amount,
          fee: gasFee,
          to_address: toAddress,
          tx_hash: txHash,
          status: 'completed',
          method: 'manual',
          created_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (userInsertError) {
        console.error('⚠️ withdrawals 기록 저장 실패:', userInsertError);
      } else {
        withdrawalId = userWithdrawalData?.withdrawal_id || '';
      }
    }

    // 8. transactions 테이블 기록
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        wallet_id: walletId,
        type: 'withdrawal',
        coin_type: coinType,
        amount: amount,
        balance_before: walletBalance,
        balance_after: newBalance,
        reference_id: withdrawalId,
        tx_hash: txHash,
        description: isAdmin ? `관리자 수동 출금 (${(params as AdminWithdrawalParams).adminRole})` : '사용자 수동 출금',
        metadata: {
          to_address: toAddress,
          gas_fee: gasFee,
          network: coinData.network,
          withdrawal_type: params.withdrawalType
        },
        created_at: new Date().toISOString()
      });

    if (txError) {
      console.error('⚠️ transaction 기록 저장 실패:', txError);
    }

    console.log(`✅ ${isAdmin ? '관리자' : '사용자'} 출금 성공:`, txHash);

    return {
      success: true,
      txHash,
      withdrawalId
    };

  } catch (error: any) {
    console.error('❌ 출금 실패:', error);
    return {
      success: false,
      error: error.message || '출금 처리 중 오류가 발생했습니다'
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

  return networkTokens[network?.toLowerCase()] || 'ETH';
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

