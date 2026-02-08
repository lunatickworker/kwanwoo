import { supabase } from './supabase/client';
import { sendProductionTransaction } from './blockchain/centerModeHelper';
import { toast } from 'sonner@2.0.3';

// 송금 요청 승인 타입
export interface ApproveTransferRequestParams {
  transfer: any;
  adminId: string;
  adminNote: string;
  estimatedGas: string;
  mode: 'production' | 'development';
  shouldDelegateTRX?: boolean; // TRX 위임 여부 (on: 가맹점으로 직접 전송, off: 사용자 지갑으로만 전송)
}

// 코인 판매 요청 승인 타입
export interface ApproveCoinSaleParams {
  sale: any;
  adminId: string;
  adminNote: string;
  estimatedGas: string;
  mode: 'production' | 'development';
  gasSponsorEnabled?: boolean; // 가스비 지원 여부
}

/**
 * 송금 요청 승인 처리
 * 
 * TRX 위임:
 *  - ON: 관리자가 수수료를 선차감하고 자동으로 사용자의 소속 가맹점으로 직접 전송
 *  - OFF: 사용자 지갑까지만 전송, 사용자가 이후 입출금 선택
 */
export async function approveTransferRequest(params: ApproveTransferRequestParams) {
  const { transfer, adminId, adminNote, estimatedGas, mode, shouldDelegateTRX = false } = params;

  try {
    console.log('📝 송금 요청 승인 시작:', {
      requestId: transfer.request_id,
      userId: transfer.user_id,
      shouldDelegateTRX,
      amount: transfer.amount,
      coinType: transfer.coin_type
    });

    const requestId = transfer.request_id || transfer.id;

    // 1. transfer_requests 전체 데이터 조회 (store_id 등 필요)
    const { data: transferData, error: fetchError } = await supabase
      .from('transfer_requests')
      .select('*')
      .eq('request_id', requestId)
      .single();

    if (fetchError || !transferData) {
      throw new Error('송금 요청을 찾을 수 없습니다');
    }

    let targetAddress = transferData.to_address; // 기본값: 사용자 지갑
    let delegatedToStore = false;
    let delegationNote = '';

    // 2. TRX 위임 ON인 경우: 가맹점 지갑으로 변경
    if (shouldDelegateTRX && transferData.store_id) {
      console.log(`🏪 TRX 위임 활성화: 가맹점(${transferData.store_id})으로 직접 전송`);

      // 가맹점의 지갑 주소 조회 (store_id는 user_id와 동일)
      const { data: storeWallet, error: walletError } = await supabase
        .from('wallets')
        .select('address')
        .eq('user_id', transferData.store_id) // store_id는 가맹점의 user_id
        .eq('coin_type', transferData.coin_type)
        .eq('wallet_type', 'hot')
        .single();

      if (walletError || !storeWallet) {
        console.warn(`⚠️ 가맹점 지갑을 찾을 수 없음. 사용자 지갑으로 전송:`, walletError);
        delegationNote = '가맹점 지갑 미설정 - 사용자 지갑으로 전송';
      } else {
        targetAddress = storeWallet.address;
        delegatedToStore = true;
        delegationNote = `가맹점 ${transferData.store_id}의 지갑으로 직접 전송`;
        console.log(`✅ 가맹점 지갑 주소 확인: ${targetAddress}`);
      }
    } else if (shouldDelegateTRX) {
      delegationNote = '가맹점 정보 없음 - 사용자 지갑으로 전송';
    } else {
      delegationNote = 'TRX 위임 비활성화 - 사용자 지갑으로 전송';
    }

    // 3. transfer_requests 상태 업데이트
    const { error: updateError } = await supabase
      .from('transfer_requests')
      .update({
        status: 'approved',
        admin_note: `${adminNote}\n\n[TRX위임] ${delegationNote}`,
        approved_at: new Date().toISOString(),
        approved_by: adminId,
        delegated_to_store: delegatedToStore
      })
      .eq('request_id', requestId);

    if (updateError) throw updateError;

    console.log('✅ transfer_requests 업데이트 완료');

    // 4. notifications 테이블에서 해당 알림을 is_read = true로 업데이트
    const { error: notificationError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('type', 'purchase_request')
      .filter('data->request_id', 'eq', requestId.toString());

    if (notificationError) {
      console.warn('⚠️ Failed to update notification read status:', notificationError);
    } else {
      console.log('✅ Notification marked as read');
    }

    // 5. 블록체인 트랜잭션 생성
    let transactionHash = null;
    if (mode === 'production') {
      console.log('🔗 블록체인 트랜잭션 전송:', {
        targetAddress,
        amount: transferData.amount,
        coinType: transferData.coin_type,
        delegatedToStore
      });

      try {
        const txResult = await sendProductionTransaction({
          type: 'transfer',
          requestId: requestId,
          userId: transferData.user_id,
          coinSymbol: transferData.coin_type,
          amount: transferData.amount,
          toAddress: targetAddress, // TRX 위임 여부에 따라 다른 주소
          estimatedGas
        } as any);

        if (txResult?.success && txResult?.txHash) {
          transactionHash = txResult.txHash;
          
          // 6. TXID를 transfer_requests에 저장
          const { error: txUpdateError } = await supabase
            .from('transfer_requests')
            .update({ tx_hash: transactionHash })
            .eq('request_id', requestId);

          if (txUpdateError) {
            console.warn('⚠️ TXID 저장 실패:', txUpdateError);
          } else {
            console.log('✅ TXID 저장 완료:', transactionHash);
          }
        } else {
          console.warn('⚠️ 트랜잭션 실패:', txResult?.error);
        }
      } catch (txError) {
        console.error('❌ 트랜잭션 전송 중 오류:', txError);
        // 트랜잭션 실패는 경고만 로그하고 계속 진행
      }
    } else {
      console.log('💡 개발 모드: 트랜잭션 생성 스킵');
    }

    return { 
      success: true,
      delegatedToStore,
      delegation: delegationNote,
      transactionHash
    };
  } catch (error) {
    console.error('❌ 송금 승인 실패:', error);
    throw error;
  }
}

/**
 * 코인 판매 요청 승인 처리 (Store -> Center)
 * 
 * 가스비 지원:
 *  - ON: 센터가 가스비를 지원하여 가맹점의 자산이 직접 센터로 전송
 *  - OFF: 가맹점이 가스비를 부담 (가맹점의 TRX 잔액 확인 필수)
 */
export async function approveCoinSale(params: ApproveCoinSaleParams) {
  const { sale, adminId, adminNote, estimatedGas, mode, gasSponsorEnabled = false } = params;

  try {
    console.log('📝 코인 판매 승인 시작:', {
      saleId: sale.sale_id || sale.id,
      storeId: sale.store_id,
      gasSponsorEnabled,
      amount: sale.coin_amount,
      coinType: sale.coin_symbol
    });

    const saleId = sale.sale_id || sale.id;
    const sponsorNote = gasSponsorEnabled ? '[가스비 지원] 센터에서 가스비 부담' : '[가스비 미지원] 가맹점에서 가스비 부담';

    // 0. 가스비 미지원(OFF)일 경우, 가맹점의 TRX 잔액 확인
    if (!gasSponsorEnabled) {
      console.log('🔍 가맹점 TRX 잔액 확인 (가스비 미지원):', sale.store_id);
      
      const { data: storeWallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', sale.store_id)
        .eq('coin_type', 'TRX')
        .eq('status', 'active')
        .single();

      if (walletError || !storeWallet) {
        console.warn('⚠️ 가맹점 TRX 지갑 없음:', sale.store_id);
        
        // 자동 거절 처리
        const rejectNote = '[자동 거절] 가맹점이 가스비를 부담하기로 설정했으나, TRX 지갑이 없습니다.';
        await supabase
          .from('store_coin_sales')
          .update({
            status: 'rejected',
            admin_note: `${adminNote}\n\n${rejectNote}`,
            approved_at: new Date().toISOString(),
            approved_by: adminId
          })
          .eq('sale_id', saleId);

        throw new Error('❌ 가맹점 TRX 지갑을 찾을 수 없습니다. 자동 거절되었습니다.');
      }

      const storeBalance = parseFloat(storeWallet.balance || '0');
      console.log('💰 가맹점 TRX 잔액:', storeBalance, 'TRX');

      // 예상 가스비 확인 (TRX 기준)
      const estimatedGasCost = estimatedGas ? parseFloat(estimatedGas) : 1; // 기본값 1 TRX
      
      if (storeBalance < estimatedGasCost) {
        console.warn(`⚠️ 가맹점 TRX 부족: 필요 ${estimatedGasCost} TRX, 보유 ${storeBalance} TRX`);
        
        // 자동 거절 처리
        const rejectNote = `[자동 거절] TRX 부족 - 필요: ${estimatedGasCost} TRX, 보유: ${storeBalance} TRX`;
        await supabase
          .from('store_coin_sales')
          .update({
            status: 'rejected',
            admin_note: `${adminNote}\n\n${rejectNote}`,
            approved_at: new Date().toISOString(),
            approved_by: adminId
          })
          .eq('sale_id', saleId);

        throw new Error(`❌ 가맹점 TRX 부족 (필요: ${estimatedGasCost} TRX, 보유: ${storeBalance} TRX). 자동 거절되었습니다.`);
      }

      console.log('✅ 가맹점 TRX 잔액 충분함');
    }

    // 1. store_coin_sales 상태 업데이트
    const { error: updateError } = await supabase
      .from('store_coin_sales')
      .update({
        status: 'approved',
        admin_note: `${adminNote}\n\n${sponsorNote}`,
        approved_at: new Date().toISOString(),
        approved_by: adminId,
        gas_sponsor_enabled: gasSponsorEnabled
      })
      .eq('sale_id', saleId);

    if (updateError) throw updateError;

    console.log('✅ store_coin_sales 업데이트 완료');

    // 2. notifications 테이블에서 해당 알림을 is_read = true로 업데이트
    const { error: notificationError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('type', 'store_coin_sale_request')
      .filter('data->sale_id', 'eq', saleId.toString());

    if (notificationError) {
      console.warn('⚠️ Failed to update notification read status:', notificationError);
    } else {
      console.log('✅ Notification marked as read');
    }

    // 3. 센터 지갑으로 코인 전송 트랜잭션
    let transactionHash = null;
    if (mode === 'production') {
      console.log('🔗 블록체인 트랜잭션 전송:', {
        targetAddress: sale.center_wallet_address,
        amount: sale.coin_amount,
        coinType: sale.coin_symbol,
        gasSponsorEnabled
      });

      try {
        const txResult = await sendProductionTransaction({
          type: 'coin_sale',
          requestId: sale.id,
          storeId: sale.store_id,
          coinSymbol: sale.coin_symbol,
          amount: sale.coin_amount,
          toAddress: sale.center_wallet_address,
          estimatedGas,
          gasSponsorEnabled
        } as any);

        if (txResult?.success && txResult?.txHash) {
          transactionHash = txResult.txHash;
          
          // TXID를 store_coin_sales에 저장
          const { error: txUpdateError } = await supabase
            .from('store_coin_sales')
            .update({ tx_hash: transactionHash })
            .eq('sale_id', saleId);

          if (txUpdateError) {
            console.warn('⚠️ TXID 저장 실패:', txUpdateError);
          } else {
            console.log('✅ TXID 저장 완료:', transactionHash);
          }
        } else {
          console.warn('⚠️ 트랜잭션 실패:', txResult?.error);
        }
      } catch (txError) {
        console.error('❌ 트랜잭션 전송 중 오류:', txError);
        // 트랜잭션 실패는 경고만 로그하고 계속 진행
      }
    } else {
      console.log('💡 개발 모드: 트랜잭션 생성 스킵');
    }

    // 4. 가맹점 KRWQ 지급 (별도 트랜잭션 또는 DB 업데이트)
    // 실제 구현 시 필요한 로직 추가

    return { 
      success: true,
      gasSponsorEnabled,
      sponsorNote,
      transactionHash
    };
  } catch (error) {
    console.error('❌ 코인 판매 승인 실패:', error);
    throw error;
  }
}

// 브라우저 디버깅 유틸리티
export const debugUsers = {
  // 모든 사용자 조회
  async checkUsers() {
    console.log('🔍 Checking all users...');
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) {
      console.error('❌ Error:', error);
    } else {
      console.log('✅ Users found:', data);
      console.table(data);
    }
    return data;
  },

  // 특정 이메일로 사용자 조회
  async findByEmail(email: string) {
    console.log(`🔍 Looking for user: ${email}`);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);
    
    if (error) {
      console.error('❌ Error:', error);
    } else if (!data || data.length === 0) {
      console.log('❌ User not found');
    } else {
      console.log('✅ User found:', data[0]);
    }
    return data;
  },

  // 테스트 사용자 생성
  async createTestUser(email = 'hong@example.com', username = 'Hong') {
    console.log(`🔨 Creating test user: ${email}`);
    
    const userData = {
      username: username,
      email: email,
      password_hash: 'password123',
      role: 'user',
      kyc_status: 'approved',
      status: 'active'
    };

    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select();
    
    if (error) {
      console.error('❌ Error creating user:', error);
      
      // 업데이트 시도
      console.log('🔄 Trying to update existing user...');
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ password_hash: 'password123' })
        .eq('email', email)
        .select();
      
      if (updateError) {
        console.error('❌ Update error:', updateError);
      } else {
        console.log('✅ User updated:', updateData);
      }
    } else {
      console.log('✅ User created:', data);
    }
    return data;
  },

  // 관리자 생성
  async createAdmin(email = 'admin@example.com', username = 'Admin') {
    console.log(`🔨 Creating admin: ${email}`);
    
    const userData = {
      username: username,
      email: email,
      password_hash: 'password123',
      role: 'admin',
      kyc_status: 'approved',
      status: 'active'
    };

    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select();
    
    if (error) {
      console.error('❌ Error creating admin:', error);
      
      // 업데이트 시도
      console.log('🔄 Trying to update existing admin...');
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ password_hash: 'password123', role: 'admin' })
        .eq('email', email)
        .select();
      
      if (updateError) {
        console.error('❌ Update error:', updateError);
      } else {
        console.log('✅ Admin updated:', updateData);
      }
    } else {
      console.log('✅ Admin created:', data);
    }
    return data;
  },

  // 테이블 구조 확인
  async checkTableStructure() {
    console.log('🔍 Checking users table structure...');
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Error:', error);
    } else if (data && data.length > 0) {
      console.log('✅ Table columns:', Object.keys(data[0]));
      console.log('Sample data:', data[0]);
    } else {
      console.log('⚠️ Table is empty');
    }
    return data;
  }
};

// 전역으로 노출
if (typeof window !== 'undefined') {
  (window as any).debugUsers = debugUsers;
}
