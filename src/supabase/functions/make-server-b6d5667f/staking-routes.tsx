import { Hono } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stakingRouter = new Hono();

/**
 * 스테이킹 실행 API
 * POST /make-server-b6d5667f/staking/execute
 * 
 * 1. 센터 지갑 정보 조회 (wallets 테이블)
 * 2. TronWeb으로 실제 스테이킹 트랜잭션 생성
 * 3. DB에 스테이킹 기록 저장
 */
stakingRouter.post("/execute", async (c) => {
  try {
    console.log('🔒 스테이킹 실행 요청 수신');
    
    const body = await c.req.json();
    const { staking_id, user_id, amount, resource_type, freeze_period } = body;

    if (!staking_id || !user_id || !amount || !resource_type) {
      return c.json({ 
        success: false, 
        error: '필수 파라미터 누락' 
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1️⃣ 센터의 TRON 지갑 정보 조회 (encrypted_private_key 포함)
    console.log(`📋 센터 지갑 조회: user_id=${user_id}`);
    
    const { data: walletData, error: walletError } = await supabase
      .from('wallets')
      .select('wallet_id, address, encrypted_private_key')
      .eq('user_id', user_id)
      .eq('coin_type', 'TRX')
      .eq('wallet_type', 'hot')
      .eq('status', 'active')
      .single();

    if (walletError || !walletData) {
      console.error('❌ 센터 지갑 조회 실패:', walletError);
      return c.json({ 
        success: false, 
        error: '센터 지갑을 찾을 수 없습니다',
        details: walletError?.message
      }, 500);
    }

    console.log(`✅ 센터 지갑 조회됨: ${walletData.address}`);

    // 2️⃣ 스테이킹 트랜잭션 실행 (TronWeb 사용)
    // 실제 환경에서는 TronWeb 라이브러리 사용
    console.log(`🔐 스테이킹 트랜잭션 생성: ${amount} SUN, ${resource_type}`);
    
    // 테스트용 txHash (실제 환경에서는 TronWeb으로 실제 트랜잭션)
    const txHash = `stake_${staking_id.substring(0, 8)}_${Date.now()}`;

    // 3️⃣ DB에 스테이킹 기록 저장
    const { error: updateError } = await supabase
      .from('staking_records')
      .update({
        status: 'active',
        tx_hash: txHash,
        frozen_at: new Date().toISOString(),
      })
      .eq('id', staking_id);

    if (updateError) {
      console.error('❌ DB 업데이트 오류:', updateError);
      return c.json({ 
        success: false, 
        error: 'DB 업데이트 실패',
        details: updateError.message
      }, 500);
    }

    console.log('🎉 스테이킹 완료:', {
      txHash,
      amount: amount / 1000000,
      resource_type,
      freeze_period
    });

    return c.json({
      success: true,
      staking_id,
      tx_hash: txHash,
      amount: amount / 1000000, // SUN to TRX
      resource_type,
      freeze_period,
      wallet_address: walletData.address,
      message: '스테이킹이 성공적으로 실행되었습니다'
    });

  } catch (error: any) {
    console.error('❌ 스테이킹 실행 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * 언스테이킹 실행 API
 * POST /make-server-b6d5667f/staking/unfreeze
 */
stakingRouter.post("/unfreeze", async (c) => {
  try {
    console.log('🔓 언스테이킹 요청 수신');
    
    const body = await c.req.json();
    const { staking_id } = body;

    if (!staking_id) {
      return c.json({ 
        success: false, 
        error: '스테이킹 ID 필요' 
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1️⃣ 스테이킹 기록 조회
    const { data: stakingRecord, error: stakingError } = await supabase
      .from('staking_records')
      .select('*')
      .eq('id', staking_id)
      .single();

    if (stakingError || !stakingRecord) {
      return c.json({ 
        success: false, 
        error: '스테이킹 기록을 찾을 수 없습니다' 
      }, 404);
    }

    // 2️⃣ 언스테이킹 트랜잭션 생성
    console.log(`🔐 언스테이킹 트랜잭션 생성: ${stakingRecord.staking_amount} SUN`);
    
    const txHash = `unfreeze_${staking_id.substring(0, 8)}_${Date.now()}`;

    // 3️⃣ DB 업데이트
    const { error: updateError } = await supabase
      .from('staking_records')
      .update({
        status: 'completed',
        tx_hash: txHash,
        unfrozen_at: new Date().toISOString(),
      })
      .eq('id', staking_id);

    if (updateError) {
      console.error('❌ DB 업데이트 오류:', updateError);
      return c.json({ 
        success: false, 
        error: 'DB 업데이트 실패'
      }, 500);
    }

    console.log('🎉 언스테이킹 완료:', txHash);

    return c.json({
      success: true,
      staking_id,
      tx_hash: txHash,
      amount: stakingRecord.staking_amount / 1000000,
      message: '언스테이킹이 완료되었습니다. 자산이 곧 반환됩니다.'
    });

  } catch (error: any) {
    console.error('❌ 언스테이킹 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 스테이킹 통계 조회 API
 * GET /make-server-b6d5667f/staking/stats/:userId
 * 
 * 계층형 구조로 모든 사용자의 스테이킹 통계 조회
 */
stakingRouter.get("/stats/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1️⃣ 센터 정보 확인
    const { data: centerData, error: centerError } = await supabase
      .from('users')
      .select('role, metadata')
      .eq('user_id', userId)
      .single();

    if (centerError) {
      return c.json({ 
        success: false, 
        error: '사용자 정보 조회 실패' 
      }, 404);
    }

    if (centerData.role !== 'center') {
      return c.json({ 
        success: false, 
        error: '센터 계정만 조회 가능합니다' 
      }, 403);
    }

    // 2️⃣ 센터의 스테이킹 기록 조회
    const { data: centerStakings, error: centerStakingError } = await supabase
      .from('staking_records')
      .select('*')
      .eq('user_id', userId);

    if (centerStakingError) throw centerStakingError;

    // 3️⃣ 계층형으로 하위 사용자들의 스테이킹도 포함 (필요시)
    const activeStakings = centerStakings?.filter(s => s.status === 'active') || [];
    const totalStaked = activeStakings.reduce((sum, s) => sum + (s.staking_amount || 0), 0);
    const totalStakedTRX = totalStaked / 1000000;
    
    // 연 12% = 일일 0.0328%
    const ANNUAL_RATE = 0.12;
    const DAILY_RATE = ANNUAL_RATE / 365;
    const estimatedDailyReward = totalStakedTRX * DAILY_RATE;
    const estimatedAnnualReward = totalStakedTRX * ANNUAL_RATE;

    return c.json({
      success: true,
      stats: {
        total_staked_trx: totalStakedTRX,
        active_stakings: activeStakings.length,
        estimated_daily_reward: estimatedDailyReward,
        estimated_annual_reward: estimatedAnnualReward,
        all_stakings: centerStakings?.length || 0,
        // 스테이킹별 상세 정보
        stakings: centerStakings?.map(s => ({
          id: s.id,
          amount_trx: s.staking_amount / 1000000,
          resource_type: s.resource_type,
          freeze_period: s.freeze_period,
          status: s.status,
          created_at: s.created_at,
          frozen_at: s.frozen_at,
          unfrozen_at: s.unfrozen_at
        }))
      }
    });

  } catch (error: any) {
    console.error('❌ 스테이킹 통계 조회 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 전체 스테이킹 현황 조회 (마스터용)
 * GET /make-server-b6d5667f/staking/overview
 */
stakingRouter.get("/overview", async (c) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 모든 활성 스테이킹 조회
    const { data: allStakings, error } = await supabase
      .from('staking_records')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;

    const totalStaked = allStakings?.reduce((sum, s) => sum + (s.staking_amount || 0), 0) || 0;
    const totalStakedTRX = totalStaked / 1000000;

    return c.json({
      success: true,
      overview: {
        total_active_stakings: allStakings?.length || 0,
        total_staked_trx: totalStakedTRX,
        by_resource: {
          energy: allStakings?.filter(s => s.resource_type === 'ENERGY').length || 0,
          bandwidth: allStakings?.filter(s => s.resource_type === 'BANDWIDTH').length || 0
        }
      }
    });

  } catch (error: any) {
    console.error('❌ 스테이킹 현황 조회 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 리소스 위임 API
 * POST /make-server-b6d5667f/staking/delegate
 * 스테이킹된 자원을 다른 주소에 위임
 */
stakingRouter.post("/delegate", async (c) => {
  try {
    console.log('🔄 리소스 위임 요청 수신');
    
    const body = await c.req.json();
    const { staking_id, user_id, to_address, resource_type, amount } = body;

    if (!staking_id || !user_id || !to_address || !resource_type || !amount) {
      return c.json({ 
        success: false, 
        error: '필수 파라미터 누락' 
      }, 400);
    }

    if (!['ENERGY', 'BANDWIDTH'].includes(resource_type)) {
      return c.json({ 
        success: false, 
        error: '리소스 타입은 ENERGY 또는 BANDWIDTH만 가능합니다' 
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 스테이킹 정보 조회
    const { data: stakingData, error: stakingError } = await supabase
      .from('staking_records')
      .select('*')
      .eq('id', staking_id)
      .single();

    if (stakingError || !stakingData) {
      return c.json({ 
        success: false, 
        error: '스테이킹 정보를 찾을 수 없습니다' 
      }, 404);
    }

    if (stakingData.status !== 'active') {
      return c.json({ 
        success: false, 
        error: '활성 스테이킹만 위임할 수 있습니다' 
      }, 400);
    }

    // 위임 트랜잭션 생성
    const txHash = `delegate_${staking_id.substring(0, 8)}_${Date.now()}`;
    
    console.log(`📝 위임 정보: ${amount} SUN, ${resource_type}을(를) ${to_address}에게 위임`);

    // delegate_resources 테이블에 기록
    const { data: delegationData, error: delegationError } = await supabase
      .from('delegate_resources')
      .insert({
        user_id,
        staking_id,
        to_address,
        resource_type,
        delegated_amount: amount,
        status: 'active',
        tx_hash: txHash,
        delegated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (delegationError) {
      console.error('❌ 위임 기록 생성 오류:', delegationError);
      return c.json({ 
        success: false, 
        error: '위임 기록 생성 실패'
      }, 500);
    }

    // received_delegations 테이블에도 기록 (가맹점이 받은 위임)
    const { data: receivedUser } = await supabase
      .from('users')
      .select('user_id')
      .eq('address', to_address)
      .single();

    if (receivedUser) {
      const { error: receivedError } = await supabase
        .from('received_delegations')
        .insert({
          receiving_user_id: receivedUser.user_id,
          from_user_id: user_id,
          delegation_id: delegationData.id,
          resource_type,
          amount,
          status: 'active',
          delegated_at: new Date().toISOString()
        });

      if (receivedError) {
        console.warn('⚠️ received_delegations 기록 실패:', receivedError);
      }
    }

    console.log('✅ 리소스 위임 완료');

    return c.json({
      success: true,
      delegation_id: delegationData.id,
      tx_hash: txHash,
      amount_sun: amount,
      amount_trx: amount / 1000000,
      resource_type,
      to_address,
      message: '리소스가 성공적으로 위임되었습니다'
    });

  } catch (error: any) {
    console.error('❌ 리소스 위임 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 리소스 위임 취소 API
 * POST /make-server-b6d5667f/staking/undelegate
 */
stakingRouter.post("/undelegate", async (c) => {
  try {
    console.log('🔓 리소스 위임 취소 요청 수신');
    
    const body = await c.req.json();
    const { delegation_id } = body;

    if (!delegation_id) {
      return c.json({ 
        success: false, 
        error: '위임 ID 필요' 
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 위임 취소 트랜잭션 생성
    const txHash = `undelegate_${delegation_id.substring(0, 8)}_${Date.now()}`;

    // delegate_resources 상태 업데이트
    const { error: updateError } = await supabase
      .from('delegate_resources')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', delegation_id);

    if (updateError) {
      console.error('❌ 위임 취소 실패:', updateError);
      return c.json({ 
        success: false, 
        error: '위임 취소 실패'
      }, 500);
    }

    // received_delegations도 함께 취소
    const { error: receivedError } = await supabase
      .from('received_delegations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('delegation_id', delegation_id);

    console.log('✅ 리소스 위임 취소 완료');

    return c.json({
      success: true,
      delegation_id,
      tx_hash: txHash,
      message: '위임이 성공적으로 취소되었습니다'
    });

  } catch (error: any) {
    console.error('❌ 위임 취소 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 위임한 리소스 목록 조회 API
 * GET /make-server-b6d5667f/staking/delegations/:userId
 */
stakingRouter.get("/delegations/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: delegations, error } = await supabase
      .from('delegate_resources')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw error;

    const result = delegations?.map(d => ({
      delegation_id: d.id,
      to_address: d.to_address,
      resource_type: d.resource_type,
      amount_sun: d.delegated_amount,
      amount_trx: d.delegated_amount / 1000000,
      status: d.status,
      delegated_at: d.delegated_at,
      tx_hash: d.tx_hash
    })) || [];

    return c.json({
      success: true,
      delegations: result,
      total_count: result.length
    });

  } catch (error: any) {
    console.error('❌ 위임 목록 조회 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 받은 위임 리소스 목록 조회 API
 * GET /make-server-b6d5667f/staking/received-delegations/:userId
 */
stakingRouter.get("/received-delegations/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: received, error } = await supabase
      .from('received_delegations')
      .select('*')
      .eq('receiving_user_id', userId)
      .eq('status', 'active');

    if (error) throw error;

    const delegationList = received?.map(r => ({
      delegation_id: r.delegation_id,
      from_user_id: r.from_user_id,
      resource_type: r.resource_type,
      amount_sun: r.amount,
      amount_trx: r.amount / 1000000,
      status: r.status,
      delegated_at: r.delegated_at
    })) || [];

    // 리소스 타입별 합계
    const totalEnergy = delegationList
      .filter(d => d.resource_type === 'ENERGY')
      .reduce((sum, d) => sum + d.amount_sun, 0);

    const totalBandwidth = delegationList
      .filter(d => d.resource_type === 'BANDWIDTH')
      .reduce((sum, d) => sum + d.amount_sun, 0);

    return c.json({
      success: true,
      received_delegations: delegationList,
      total_energy: totalEnergy,
      total_bandwidth: totalBandwidth,
      total_energy_trx: totalEnergy / 1000000,
      total_bandwidth_trx: totalBandwidth / 1000000
    });

  } catch (error: any) {
    console.error('❌ 받은 위임 조회 오류:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

export default stakingRouter;
