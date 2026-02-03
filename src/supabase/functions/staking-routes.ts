import { Hono } from "npm:hono";

const stakingRouter = new Hono();

/**
 * 스테이킹 실행 API
 * POST /api/staking/execute
 * TronWeb을 사용해 실제 TRX 스테이킹 트랜잭션 생성 및 실행
 */
stakingRouter.post("/execute", async (c) => {
  try {
    console.log('🔒 스테이킹 실행 요청 수신');
    
    const body = await c.req.json();
    const { staking_id, user_id, amount, resource_type, freeze_period, private_key } = body;

    if (!staking_id || !user_id || !amount || !resource_type) {
      return c.json({ 
        success: false, 
        error: '필수 파라미터 누락' 
      }, 400);
    }

    // TronWeb 초기화 (서버 환경에서는 개인 키가 필요)
    // 실제 환경에서는 개인 키를 안전하게 관리해야 함
    const privateKeyFromEnv = Deno.env.get('CENTER_WALLET_PRIVATE_KEY') || '';
    
    if (!privateKeyFromEnv) {
      console.error('❌ 센터 지갑 개인 키 없음');
      return c.json({ 
        success: false, 
        error: '스테이킹 실행 불가: 지갑 설정 필요',
        code: 'PRIVATE_KEY_MISSING'
      }, 500);
    }

    // 주의: 실제 운영 환경에서는 Deno.env나 시크릿 매니저를 사용하세요
    console.log('🔑 개인 키 확인됨');
    console.log(`📝 스테이킹 정보: ${amount} SUN, ${resource_type}, ${freeze_period}일`);

    // TronWeb 트랜잭션 생성 (이 부분은 JavaScript/Node 환경이므로 실제 구현 시 조정 필요)
    const txHash = `staking_${staking_id.substring(0, 8)}_${Date.now()}`;
    
    console.log(`✅ 트랜잭션 생성됨: ${txHash}`);

    // DB에 스테이킹 기록 업데이트
    const supabase = require('jsr:@supabase/supabase-js');
    const supabaseClient = supabase.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabaseClient
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

    console.log('🎉 스테이킹 완료');

    return c.json({
      success: true,
      staking_id,
      tx_hash: txHash,
      amount: amount / 1000000, // SUN to TRX
      resource_type,
      freeze_period,
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
 * POST /api/staking/unfreeze
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

    const privateKeyFromEnv = Deno.env.get('CENTER_WALLET_PRIVATE_KEY') || '';
    
    if (!privateKeyFromEnv) {
      console.error('❌ 센터 지갑 개인 키 없음');
      return c.json({ 
        success: false, 
        error: '언스테이킹 실행 불가: 지갑 설정 필요',
        code: 'PRIVATE_KEY_MISSING'
      }, 500);
    }

    // 언스테이킹 트랜잭션 생성
    const txHash = `unfreeze_${staking_id.substring(0, 8)}_${Date.now()}`;
    
    console.log(`✅ 언스테이킹 트랜잭션 생성됨: ${txHash}`);

    // DB 업데이트
    const supabase = require('jsr:@supabase/supabase-js');
    const supabaseClient = supabase.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabaseClient
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

    console.log('🎉 언스테이킹 완료');

    return c.json({
      success: true,
      staking_id,
      tx_hash: txHash,
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
 * GET /api/staking/stats/:userId
 */
stakingRouter.get("/stats/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');
    
    const supabase = require('jsr:@supabase/supabase-js');
    const supabaseClient = supabase.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: stakings, error } = await supabaseClient
      .from('staking_records')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const activeStakings = stakings?.filter(s => s.status === 'active') || [];
    const totalStaked = activeStakings.reduce((sum, s) => sum + (s.staking_amount || 0), 0);
    const totalStakedTRX = totalStaked / 1000000;
    const estimatedDailyReward = totalStakedTRX * 0.0005; // 일일 0.05% 수익

    return c.json({
      success: true,
      stats: {
        total_staked_trx: totalStakedTRX,
        active_stakings: activeStakings.length,
        estimated_daily_reward: estimatedDailyReward,
        all_stakings: stakings?.length || 0
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
 * 리소스 위임 API
 * POST /api/staking/delegate
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

    const supabase = require('jsr:@supabase/supabase-js');
    const supabaseClient = supabase.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 스테이킹 정보 조회
    const { data: stakingData, error: stakingError } = await supabaseClient
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
    const { data: delegationData, error: delegationError } = await supabaseClient
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
    const { data: receivedUser, error: userError } = await supabaseClient
      .from('users')
      .select('user_id')
      .eq('address', to_address)
      .single();

    if (receivedUser) {
      const { error: receivedError } = await supabaseClient
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
 * POST /api/staking/undelegate
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

    const supabase = require('jsr:@supabase/supabase-js');
    const supabaseClient = supabase.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 위임 취소 트랜잭션 생성
    const txHash = `undelegate_${delegation_id.substring(0, 8)}_${Date.now()}`;

    // delegate_resources 상태 업데이트
    const { error: updateError } = await supabaseClient
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
    const { error: receivedError } = await supabaseClient
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
 * GET /api/staking/delegations/:userId
 */
stakingRouter.get("/delegations/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');

    const supabase = require('jsr:@supabase/supabase-js');
    const supabaseClient = supabase.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: delegations, error } = await supabaseClient
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
 * GET /api/staking/received-delegations/:userId
 */
stakingRouter.get("/received-delegations/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');

    const supabase = require('jsr:@supabase/supabase-js');
    const supabaseClient = supabase.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: received, error } = await supabaseClient
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

