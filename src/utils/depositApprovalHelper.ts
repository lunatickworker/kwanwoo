import { supabase } from './supabase/client';
import { SUPABASE_CONFIG } from './config';
import { toast } from 'sonner@2.0.3';
import { getCenterOperationMode, sendProductionTransaction, generateDevTxHash } from './blockchain/centerModeHelper';

interface ApproveRequestParams {
  request: {
    request_id: string;
    user_id: string;
    wallet_id: string;
    coin_type: string;
    amount: number;
  };
  adminNote: string;
  adminId: string;
}

interface ApprovalResult {
  success: boolean;
  error?: string;
}

/**
 * 코인 구매 요청 승인 처리
 * - 센터 운영 모드에 따라 개발/프로덕션 모드로 분기
 */
export async function approveTransferRequest(params: ApproveRequestParams): Promise<ApprovalResult> {
  const { request, adminNote, adminId } = params;

  try {
    console.log('📋 코인 구매 요청 승인 시작:', request);
    console.log('👤 승인자 ID:', adminId);

    // 1. 대상 센터 정보 조회 (승인자 또는 요청자 기준)
    const { data: adminData, error: adminError } = await supabase
      .from('users')
      .select('user_id, role, email, parent_user_id, tenant_id')
      .eq('user_id', adminId)
      .maybeSingle();

    console.log('🔍 승인자 정보 조회 결과:', { adminData, adminError });

    if (adminError) {
      console.error('❌ 승인자 정보 조회 중 데이터베이스 오류:', adminError);
      throw new Error(`승인자 정보 조회 실패: ${adminError.message}`);
    }

    if (!adminData) {
      console.error('❌ 승인자가 users 테이블에 존재하지 않음:', adminId);
      throw new Error(`승인자 정보를 찾을 수 없습니다. 사용자 ID가 데이터베이스에 등록되지 않았습니다. (${adminId})`);
    }

    let targetCenterId: string | null = null;
    let targetContextId = adminId; // 기본은 현재 승인자

    // 센터 관리자 본인인 경우
    if (adminData.role === 'center') {
      targetCenterId = adminId;
      targetContextId = adminId;
      console.log('🏢 센터 관리자 직접 승인: targetCenterId =', targetCenterId);
    }
    // 가맹점 관리자인 경우 - parent_user_id가 센터일 가능성
    else if (adminData.role === 'store' && adminData.parent_user_id) {
      console.log('🏪 가맹점 관리자 승인: 상위 센터 조회');
      const centerInfo = await findCenterFromHierarchy(adminId);
      if (centerInfo) {
        targetCenterId = centerInfo.centerId;
        targetContextId = centerInfo.centerId;
        console.log('✅ 가맹점의 센터 발견:', centerInfo);
      }
    }
    // 에이전시 관리자인 경우
    else if (adminData.role === 'agency') {
      console.log('🏢 에이전시 관리자 승인: 요청 사용자의 센터 찾기');
      const centerInfo = await findCenterFromHierarchy(request.user_id);
      if (centerInfo) {
        targetCenterId = centerInfo.centerId;
        targetContextId = centerInfo.centerId;
        console.log('✅ 요청자의 센터 발견:', centerInfo);
      }
    }
    // 마스터 관리자인 경우
    else if (adminData.role === 'master') {
      console.log('👑 마스터 관리자 승인: 요청 사용자의 센터 찾기');
      const centerInfo = await findCenterFromHierarchy(request.user_id);
      if (centerInfo) {
        targetCenterId = centerInfo.centerId;
        targetContextId = centerInfo.centerId;
        console.log('✅ 요청자의 센터 발견:', centerInfo);
      }
    }
    // tenant_id로 센터 확인
    else if (adminData.tenant_id) {
      console.log('🏢 tenant_id로 센터 확인:', adminData.tenant_id);
      targetCenterId = adminData.tenant_id;
      targetContextId = adminData.tenant_id;
    }
    // 그 외의 경우 - 요청 사용자의 계층 구조 추적
    else {
      console.log('🔍 일반 사용자 승인: 계층 구조 추적하여 센터 찾기');
      const centerInfo = await findCenterFromHierarchy(request.user_id);
      if (centerInfo) {
        targetCenterId = centerInfo.centerId;
        targetContextId = centerInfo.centerId;
        console.log('✅ 계층 추적으로 센터 발견:', centerInfo);
      }
    }

    console.log('🎯 최종 센터 정보:', { targetCenterId, targetContextId, adminRole: adminData.role });

    if (!targetCenterId) {
      throw new Error(`센터 정보를 찾을 수 없습니다. 승인자: ${adminData.role}, 요청자: ${request.user_id}`);
    }

    // 2. 센터 운영 모드 확인 (대상 센터 컨텍스트 기준)
    const operationMode = await getCenterOperationMode(targetContextId);
    console.log(`🔧 센터 운영 모드 (${targetCenterId}): ${operationMode}`);

    // 3. coin_type 정규화 (USDT-TRC20 -> USDT)
    const normalizeCoinType = (coinType: string): string => {
      return coinType.split('-')[0];
    };
    const normalizedCoinType = normalizeCoinType(request.coin_type);

    // 3. 사용자 지갑 정보 조회
    const { data: userWalletData, error: userWalletError } = await supabase
      .from('wallets')
      .select('address, balance')
      .eq('wallet_id', request.wallet_id)
      .single();

    if (userWalletError || !userWalletData) {
      throw new Error('사용자 지갑을 찾을 수 없습니다');
    }

    // 4. 관리자 지갑 조회
    const adminWalletData = await findAdminWallet(adminId, normalizedCoinType, request.coin_type);
    if (!adminWalletData) {
      throw new Error(`관리자의 ${normalizedCoinType} 지갑을 찾을 수 없습니다. 지갑 관리에서 ${normalizedCoinType} 지갑을 먼저 생성해주세요.`);
    }

    // 5. 코인 정보 조회
    const { data: coinData, error: coinError } = await supabase
      .from('supported_tokens')
      .select('*')
      .eq('symbol', request.coin_type)
      .single();

    if (coinError || !coinData) {
      throw new Error('코인 정보를 찾을 수 없습니다');
    }

    let txHash: string;
    let depositMethod: string;

    // ============================================
    // 운영 모드에 따른 분기 처리
    // ============================================

    if (operationMode === 'development') {
      // 개발 모드: 가짜 txHash 생성, 무한 지급
      console.log('🔵 개발 모드: 가짜 txHash 생성');
      txHash = generateDevTxHash();
      depositMethod = 'standard';  // DB 스키마에 맞게 'standard' 사용
      toast.info('개발모드 트랜잭션 처리 완료');
    } else {
      // 프로덕션 모드: 실제 블록체인 트랜잭션
      console.log('🟢 프로덕션 모드: 실제 블록체인 트랜잭션 전송');
      toast.info('프로덕션 모드: 실제 블록체인 트랜잭션을 전송합니다...');

      // 실제 블록체인 트랜잭션 전송
      const result = await sendProductionTransaction({
        centerId: targetCenterId,
        toAddress: userWalletData.address,
        coinType: request.coin_type,
        amount: request.amount.toString(),
        adminId: adminId
      });

      if (!result.success) {
        // 잔액 부족 또는 기타 오류
        if (result.error?.includes('잔액 부족')) {
          // 대기열에 추가
          await addToPendingQueue({
            requestId: request.request_id,
            centerId: targetCenterId,
            userId: request.user_id,
            coinType: request.coin_type,
            amount: request.amount,
            toAddress: userWalletData.address,
            failureReason: result.error,
            gasEstimate: result.gasEstimate
          });

          toast.error(
            `⚠️ 잔액 부족\n\n${result.error}\n\n대기열에 추가되었습니다. 관리자 지갑을 충전해주세요.`,
            { duration: 10000 }
          );

          return { success: false, error: result.error };
        }

        throw new Error(result.error || '블록체인 트랜잭션 전송 실패');
      }

      txHash = result.txHash!;
      depositMethod = 'standard';  // DB 스키마에 맞게 'standard' 사용
      toast.success(`블록체인 트랜잭션 성공! TX: ${txHash.substring(0, 10)}...`);
    }

    // 6. 요청 상태를 승인으로 변경
    const { error: requestError } = await supabase
      .from('transfer_requests')
      .update({
        status: 'approved',
        admin_note: adminNote,
        approved_at: new Date().toISOString()
      })
      .eq('request_id', request.request_id);

    if (requestError) throw requestError;

    // 7. 지갑 잔액 업데이트
    const newBalance = parseFloat(userWalletData.balance) + request.amount;
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('wallet_id', request.wallet_id);

    if (updateError) throw updateError;

    // 8. deposits 테이블에 입금 기록 생성
    const { error: depositError } = await supabase
      .from('deposits')
      .insert({
        user_id: request.user_id,
        wallet_id: request.wallet_id,
        coin_type: request.coin_type,
        amount: request.amount,
        tx_hash: txHash,
        confirmations: 1,
        required_confirmations: 1,
        status: 'confirmed',
        from_address: adminWalletData.address,
        method: depositMethod,
        created_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString()
      });

    if (depositError) {
      console.error('❌ 입금 기록 저장 실패:', depositError);
    }

    // 9. transactions 테이블에 기록
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: request.user_id,
        wallet_id: request.wallet_id,
        type: 'deposit',
        coin_type: request.coin_type,
        amount: request.amount,
        balance_before: parseFloat(userWalletData.balance),
        balance_after: newBalance,
        reference_id: request.request_id,
        tx_hash: txHash,
        description: '코인 구매 승인',
        metadata: {
          operation_mode: operationMode,
          method: depositMethod,
          admin_id: adminId
        },
        created_at: new Date().toISOString()
      });

    if (txError) {
      console.error('❌ 트랜잭션 기록 실패:', txError);
    }

    // ===========================
    // 자동 출금 프로세스 (재활성화됨)
    // ===========================
    await processAutoWithdrawal({
      request,
      operationMode,
      txHash
    });

    toast.success('✅ 코인 구매 요청이 승인되었습니다');
    return { success: true };

  } catch (error: any) {
    console.error('❌ 승인 처리 실패:', error);
    return { success: false, error: error.message || '승인 처리 중 오류가 발생했습니다' };
  }
}

/**
 * 가맹점 코인 판매 요청 승인 처리
 * - Store Wallet -> Center Wallet
 * - 현재는 DB 잔액 이동만 처리 (Internal Transfer)
 */
export async function approveCoinSale(params: {
  sale: any; // store_coin_sales row
  adminId: string;
  adminNote: string;
}): Promise<ApprovalResult> {
  const { sale, adminId, adminNote } = params;
  
  try {
     console.log('📋 가맹점 코인 판매 승인 시작:', sale);
     
     // 1. 지갑 직접 조회 (wallet_id 사용)
     const { data: storeWallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('wallet_id', sale.wallet_id)
        .single();
        
     if (walletError || !storeWallet) {
        throw new Error('지갑을 찾을 수 없습니다');
     }
     
     // 실제 잔액 계산: transactions에서 조회
     const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, type')
        .eq('wallet_id', sale.wallet_id);
     
     let actualBalance = 0;
     transactions?.forEach((tx: any) => {
        if (tx.type === 'deposit' || tx.type === 'swap') {
           actualBalance += Number(tx.amount);
        } else if (tx.type === 'withdrawal') {
           actualBalance -= Number(tx.amount);
        }
     });
     
     console.log(`💰 지갑(${storeWallet.wallet_id}): 실제 잔액 ${actualBalance} (요청: ${sale.amount})`);
     
     // 실제 잔액 체크
     if (actualBalance < sale.amount) {
        throw new Error(`지갑 잔액이 부족합니다 (보유: ${actualBalance}, 요청: ${sale.amount})`);
     }
     
     // 2. 센터 지갑 조회 (받을 지갑)
     // Hot 지갑 우선, 없으면 Cold
     let { data: centerWallet, error: centerWalletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', sale.center_id)
        .eq('coin_type', sale.coin_type)
        .eq('wallet_type', 'hot')
        .eq('status', 'active')
        .maybeSingle();
        
     if (!centerWallet) {
        const { data: coldWallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', sale.center_id)
            .eq('coin_type', sale.coin_type)
            .eq('wallet_type', 'cold')
            .eq('status', 'active')
            .maybeSingle();
        centerWallet = coldWallet;
     }
     
     if (!centerWallet) throw new Error(`센터의 ${sale.coin_type} 지갑을 찾을 수 없습니다`);
     
     // 3. 상태 업데이트 ('approved')
     const { error: updateStatusError } = await supabase
        .from('store_coin_sales')
        .update({
            status: 'approved',
            admin_note: adminNote,
            approved_by: adminId,
            approved_at: new Date().toISOString()
        })
        .eq('sale_id', sale.sale_id)
        .eq('status', 'pending'); // 낙관적 락
        
     if (updateStatusError) throw new Error('이미 처리되었거나 상태를 업데이트할 수 없습니다');
     
     // 4. 잔액 이동
     // 가맹점 차감
     const newStoreBalance = parseFloat(storeWallet.balance) - sale.amount;
     const { error: deductError } = await supabase
        .from('wallets')
        .update({ balance: newStoreBalance })
        .eq('wallet_id', storeWallet.wallet_id);
        
     if (deductError) {
         console.error('CRITICAL: 가맹점 잔액 차감 실패', deductError);
         // 복구 로직이 필요할 수 있음
         throw deductError;
     }
     
     // 센터 증가
     const newCenterBalance = parseFloat(centerWallet.balance) + sale.amount;
     const { error: addError } = await supabase
        .from('wallets')
        .update({ balance: newCenterBalance })
        .eq('wallet_id', centerWallet.wallet_id);
        
     if (addError) {
         console.error('CRITICAL: 센터 잔액 증가 실패', addError);
     }
     
     // 5. 트랜잭션 기록
     const txHash = `internal_sale_${Date.now()}`;
     
     // 가맹점 (출금/판매)
     await supabase.from('transactions').insert({
         user_id: sale.store_id,
         wallet_id: storeWallet.wallet_id,
         type: 'withdrawal', // 'sale' 타입이 없으면 withdrawal 사용
         coin_type: sale.coin_type,
         amount: sale.amount,
         balance_before: storeWallet.balance,
         balance_after: newStoreBalance,
         reference_id: sale.sale_id,
         tx_hash: txHash,
         description: `코인 판매 (To Center)`,
         metadata: { 
             center_id: sale.center_id, 
             sale_id: sale.sale_id,
             type: 'store_coin_sale'
         }
     });
     
     // 센터 (입금/매입)
     await supabase.from('transactions').insert({
         user_id: sale.center_id,
         wallet_id: centerWallet.wallet_id,
         type: 'deposit', // 'purchase' 타입이 없으면 deposit 사용
         coin_type: sale.coin_type,
         amount: sale.amount,
         balance_before: centerWallet.balance,
         balance_after: newCenterBalance,
         reference_id: sale.sale_id,
         tx_hash: txHash,
         description: `가맹점 코인 매입 (From Store: ${sale.store_id})`,
         metadata: { 
             store_id: sale.store_id, 
             sale_id: sale.sale_id,
             type: 'store_coin_purchase'
         }
     });
     
     // 6. 알림 전송 (가맹점에게)
     await supabase.from('notifications').insert({
         user_id: sale.store_id,
         type: 'store_coin_sale_approved',
         title: '✅ 코인 판매 승인 완료',
         message: `요청하신 ${sale.amount} ${sale.coin_type} 판매가 승인되었습니다.`,
         is_read: false,
         metadata: { sale_id: sale.sale_id }
     });
     
     toast.success('✅ 코인 판매 승인 및 정산이 완료되었습니다');
     return { success: true };
     
  } catch (e: any) {
      console.error('❌ 판매 승인 오류:', e);
      return { success: false, error: e.message };
  }
}

/**
 * 관리자 지갑 찾기 (Hot > Cold 순서)
 */
async function findAdminWallet(adminId: string, normalizedCoinType: string, originalCoinType: string) {
  console.log('🔍 관리자 지갑 조회:', { adminId, normalizedCoinType, originalCoinType });

  // Hot 지갑 우선 조회 (정규화된 타입)
  const { data: hotWallet } = await supabase
    .from('wallets')
    .select('address, wallet_id, wallet_type, coin_type')
    .eq('user_id', adminId)
    .eq('coin_type', normalizedCoinType)
    .eq('wallet_type', 'hot')
    .eq('status', 'active')
    .maybeSingle();

  if (hotWallet) {
    console.log('✅ Hot 지갑 발견:', hotWallet);
    return hotWallet;
  }

  // Cold 지갑 조회 (정규화된 타입)
  const { data: coldWallet } = await supabase
    .from('wallets')
    .select('address, wallet_id, wallet_type, coin_type')
    .eq('user_id', adminId)
    .eq('coin_type', normalizedCoinType)
    .eq('wallet_type', 'cold')
    .eq('status', 'active')
    .maybeSingle();

  if (coldWallet) {
    console.log('✅ Cold 지갑 발견:', coldWallet);
    return coldWallet;
  }

  // 원본 타입으로 재시도
  if (originalCoinType !== normalizedCoinType) {
    console.log('⚠️ 원본 타입으로 재시도:', originalCoinType);

    const { data: hotWalletOriginal } = await supabase
      .from('wallets')
      .select('address, wallet_id, wallet_type, coin_type')
      .eq('user_id', adminId)
      .eq('coin_type', originalCoinType)
      .eq('wallet_type', 'hot')
      .eq('status', 'active')
      .maybeSingle();

    if (hotWalletOriginal) {
      console.log('✅ Hot 지갑 발견 (원본):', hotWalletOriginal);
      return hotWalletOriginal;
    }

    const { data: coldWalletOriginal } = await supabase
      .from('wallets')
      .select('address, wallet_id, wallet_type, coin_type')
      .eq('user_id', adminId)
      .eq('coin_type', originalCoinType)
      .eq('wallet_type', 'cold')
      .eq('status', 'active')
      .maybeSingle();

    if (coldWalletOriginal) {
      console.log('✅ Cold 지갑 발견 (원본):', coldWalletOriginal);
      return coldWalletOriginal;
    }
  }

  return null;
}

/**
 * 대기열에 추가
 */
async function addToPendingQueue(params: {
  requestId: string;
  centerId: string;
  userId: string;
  coinType: string;
  amount: number;
  toAddress: string;
  failureReason: string;
  gasEstimate?: { estimatedCost: string; token: string };
}) {
  try {
    const { error } = await supabase
      .from('pending_transactions_queue')
      .insert({
        request_id: params.requestId,
        center_id: params.centerId,
        user_id: params.userId,
        coin_type: params.coinType,
        amount: params.amount,
        to_address: params.toAddress,
        status: 'pending',
        failure_reason: params.failureReason,
        estimated_gas_cost: params.gasEstimate?.estimatedCost,
        gas_token: params.gasEstimate?.token,
        admin_notified: false,
        metadata: {
          created_by: 'approval_process',
          timestamp: new Date().toISOString()
        }
      });

    if (error) {
      console.error('❌ 대기열 추가 실패:', error);
    } else {
      console.log('✅ 대기열에 추가됨');

      // 관리자에게 알림 전송
      await sendAdminNotification(params);
    }
  } catch (error) {
    console.error('❌ 대기열 추가 중 오류:', error);
  }
}

/**
 * 관리자에게 알림 전송
 */
async function sendAdminNotification(params: any) {
  try {
    // 센터의 모든 관리자 조회
    const { data: admins } = await supabase
      .from('users')
      .select('user_id')
      .eq('center_id', params.centerId)
      .in('role', ['center', 'agency', 'master']);

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin) => ({
        user_id: admin.user_id,
        type: 'system',
        title: '⚠️ 트랜잭션 잔액 부족',
        message: `${params.coinType} ${params.amount} 전송이 잔액 부족으로 대기 중입니다. 지갑을 충전해주세요.`,
        is_read: false,
        metadata: {
          request_id: params.requestId,
          coin_type: params.coinType,
          amount: params.amount,
          failure_reason: params.failureReason
        }
      }));

      await supabase.from('notifications').insert(notifications);
      console.log('✅ 관리자 알림 전송 완료');
    }
  } catch (error) {
    console.error('❌ 관리자 알림 전송 실패:', error);
  }
}

/**
 * 계층 구조를 따라 센터 찾기
 * parent_user_id 또는 tenant_id를 사용하여 상위로 추적
 */
async function findCenterFromHierarchy(userId: string): Promise<{ centerId: string; centerRole: string } | null> {
  console.log('🔍 계층 구조 추적 시작:', userId);
  
  let currentUserId: string | null = userId;
  let depth = 0;
  const maxDepth = 10; // 무한 루프 방지

  while (currentUserId && depth < maxDepth) {
    console.log(`  📍 레벨 ${depth}: 사용자 ID ${currentUserId} 조회 중...`);
    
    const { data: userData, error } = await supabase
      .from('users')
      .select('user_id, role, parent_user_id, tenant_id')
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (error) {
      console.error('    ❌ 조회 오류:', error);
      break;
    }

    if (!userData) {
      console.log('    ⚠️ 사용자 없음');
      break;
    }

    // 센터를 찾았다!
    if (userData.role === 'center') {
      console.log('    🎯 센터 발견!', userData.user_id);
      return {
        centerId: userData.user_id,
        centerRole: userData.role
      };
    }

    // tenant_id가 있으면 그것이 센터일 가능성이 높음
    if (userData.tenant_id) {
      console.log('    🏢 tenant_id로 센터 조회:', userData.tenant_id);
      const { data: tenantData } = await supabase
        .from('users')
        .select('user_id, role')
        .eq('user_id', userData.tenant_id)
        .maybeSingle();

      if (tenantData && tenantData.role === 'center') {
        console.log('    🎯 tenant_id로 센터 발견!', tenantData.user_id);
        return {
          centerId: tenantData.user_id,
          centerRole: tenantData.role
        };
      }
    }

    // 상위로 이동
    currentUserId = userData.parent_user_id;
    depth++;
  }

  console.log('  ❌ 계층 추적 완료 - 센터를 찾지 못함');
  return null;
}

/**
 * 자동 출금 프로세스 (재활성화됨)
 */
async function processAutoWithdrawal(params: {
  request: any;
  operationMode: 'development' | 'production';
  txHash: string;
}) {
  const { request, operationMode, txHash } = params;

  try {
    console.log('🔄 자동 출금 프로세스 시작');

    // 사용자의 가맹점 조회
    const { data: userData } = await supabase
      .from('users')
      .select('parent_user_id')
      .eq('user_id', request.user_id)
      .single();

    if (!userData?.parent_user_id) {
      console.warn('⚠️ 가맹점 정보 없음, 자동 출금 건너뜀');
      return;
    }

    const storeId = userData.parent_user_id;

    // 가맹점 지갑 조회
    const { data: storeWallet } = await supabase
      .from('wallets')
      .select('address, wallet_id')
      .eq('user_id', storeId)
      .eq('coin_type', request.coin_type)
      .single();

    if (!storeWallet) {
      console.warn('⚠️ 가맹점 지갑 없음, 자동 출금 건너뜀');
      return;
    }

    let withdrawTxHash: string;

    if (operationMode === 'development') {
      // 개발 모드: 가짜 txHash
      withdrawTxHash = `dev_withdraw_${Date.now()}`;
    } else {
      // 프로덕션 모드: 실제 전송 (향후 Biconomy API 호출)
      withdrawTxHash = `manual_withdrawal_${Date.now()}`;
      // TODO: 프로덕션 모드에서 실제 블록체인 전송 구현
    }

    // 사용자 지갑 잔액 차감
    await supabase
      .from('wallets')
      .update({ balance: 0 })
      .eq('wallet_id', request.wallet_id);

    // 출금 기록 생성
    await supabase
      .from('withdrawals')
      .insert({
        user_id: request.user_id,
        wallet_id: request.wallet_id,
        coin_type: request.coin_type,
        amount: request.amount,
        tx_hash: withdrawTxHash,
        to_address: storeWallet.address,
        status: 'completed',
        fee: 0,
        method: 'standard',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

    // 트랜잭션 기록
    await supabase
      .from('transactions')
      .insert({
        user_id: request.user_id,
        wallet_id: request.wallet_id,
        type: 'withdrawal',
        coin_type: request.coin_type,
        amount: request.amount,
        balance_before: request.amount,
        balance_after: 0,
        reference_id: request.request_id,
        tx_hash: withdrawTxHash,
        description: '가맹점 자동 출금',
        metadata: {
          operation_mode: operationMode,
          store_id: storeId,
          store_address: storeWallet.address,
          deposit_tx_hash: txHash
        },
        created_at: new Date().toISOString()
      });

    // 사용자 알림
    await supabase
      .from('notifications')
      .insert({
        user_id: request.user_id,
        type: 'transaction',
        title: '입금 완료 및 자동 출금',
        message: `${request.amount} ${request.coin_type} 입금이 완료되어 가맹점으로 자동 전송되었습니다.`,
        is_read: false
      });

    console.log('✅ 자동 출금 완료:', withdrawTxHash);
    toast.success('가맹점으로 자동 출금이 완료되었습니다');

  } catch (error: any) {
    console.error('❌ 자동 출금 실패:', error);
    toast.warning('자동 출금에 실패했습니다. 수동으로 출금해주세요.');
  }
}
