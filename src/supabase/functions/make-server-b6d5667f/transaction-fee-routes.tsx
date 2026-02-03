/**
 * TRON 거래 이력 및 수수료 계산 API
 * TronScan API를 사용해 거래 내역 조회 및 평균 수수료 계산
 */

import { Hono } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2";

const transactionRouter = new Hono();

const TRON_API_KEY = Deno.env.get('TRON_API_KEY') || '';
const TRON_SCAN_API = 'https://apilist.tronscan.org/api';

interface TransactionHistory {
  hash: string;
  timestamp: number;
  amount: string;
  fee: number; // TRX
  from: string;
  to: string;
  status: 'success' | 'failed';
}

interface FeeEstimate {
  average_fee: number; // TRX
  min_fee: number;
  max_fee: number;
  transaction_count: number;
  can_estimate: boolean; // 5건 이상이면 true
  warning?: string;
}

/**
 * 거래 이력 조회
 * GET /make-server-b6d5667f/transaction/history/:address
 * 
 * 최근 20건의 거래 이력 조회
 */
transactionRouter.get("/history/:address", async (c) => {
  try {
    const address = c.req.param('address');
    
    if (!address || !address.startsWith('T')) {
      return c.json({
        success: false,
        error: '유효한 TRON 주소가 필요합니다'
      }, 400);
    }

    console.log(`📋 거래 이력 조회: ${address}`);

    // TronScan API 호출
    const response = await fetch(
      `${TRON_SCAN_API}/transaction?address=${address}&limit=20&start=0&apikey=${TRON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TronScan API 오류: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.log('⚠️ 거래 이력 없음');
      return c.json({
        success: true,
        transactions: [],
        total: 0
      });
    }

    // 거래 정보 변환
    const transactions: TransactionHistory[] = data.data.map((tx: any) => ({
      hash: tx.hash,
      timestamp: tx.timestamp,
      amount: (Number(tx.amount) / 1000000).toString(), // SUN to TRX
      fee: (tx.cost?.fee || 0) / 1000000, // SUN to TRX
      from: tx.ownerAddress,
      to: tx.toAddress,
      status: tx.result === 'SUCCESS' ? 'success' : 'failed'
    }));

    console.log(`✅ 거래 이력 ${transactions.length}건 조회됨`);

    return c.json({
      success: true,
      transactions,
      total: data.total
    });

  } catch (error: any) {
    console.error('❌ 거래 이력 조회 오류:', error);
    return c.json({
      success: false,
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 평균 수수료 계산
 * GET /make-server-b6d5667f/transaction/estimate-fee/:address
 * 
 * 최근 거래의 평균 수수료 계산
 * - 5건 이상 거래 필요
 * - 수수료 0인 거래는 제외
 */
transactionRouter.get("/estimate-fee/:address", async (c) => {
  try {
    const address = c.req.param('address');
    
    if (!address || !address.startsWith('T')) {
      return c.json({
        success: false,
        error: '유효한 TRON 주소가 필요합니다'
      }, 400);
    }

    console.log(`💰 수수료 추정: ${address}`);

    // 거래 이력 조회 (최근 50건)
    const response = await fetch(
      `${TRON_SCAN_API}/transaction?address=${address}&limit=50&start=0&apikey=${TRON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TronScan API 오류: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.log('⚠️ 거래 이력 없음 - 수수료 추정 불가');
      return c.json({
        success: true,
        fee_estimate: {
          average_fee: 0,
          min_fee: 0,
          max_fee: 0,
          transaction_count: 0,
          can_estimate: false,
          warning: '거래 이력이 없어 수수료를 추정할 수 없습니다. 최소 5건 이상의 거래가 필요합니다.'
        }
      });
    }

    // 수수료 계산 로직 (API 응답 구조 분석)
    // cost 객체 구조:
    // - net_fee: 대역폭 비용 (SUN)
    // - energy_fee: 에너지 비용 (SUN)  
    // - fee: 총 수수료 (SUN) = net_fee + energy_fee + energy_usage_total
    
    const feesInTRX: number[] = [];
    
    for (const tx of data.data) {
      // 성공한 거래만 고려
      if (tx.result !== 'SUCCESS') continue;
      
      let txFee = 0;
      
      // cost 객체가 있으면 실제 수수료 사용
      if (tx.cost && typeof tx.cost === 'object') {
        // fee 필드가 있으면 사용 (가장 정확함)
        if (tx.cost.fee && tx.cost.fee > 0) {
          txFee = tx.cost.fee;
        }
        // fee가 없으면 net_fee + energy_fee 계산
        else if ((tx.cost.net_fee || 0) + (tx.cost.energy_fee || 0) > 0) {
          txFee = (tx.cost.net_fee || 0) + (tx.cost.energy_fee || 0);
        }
      }
      
      // 0이 아닌 수수료만 포함
      if (txFee > 0) {
        feesInTRX.push(txFee / 1000000); // SUN to TRX
      }
    }

    console.log(`📊 수수료 거래: ${feesInTRX.length}건 / 전체 ${data.data.length}건 중`);
    console.log(`💰 수수료 배열:`, feesInTRX.map(f => f.toFixed(6)));

    // 수수료 추정 가능 여부 (5건 이상)
    const canEstimate = feesInTRX.length >= 5;

    if (feesInTRX.length === 0) {
      console.log('⚠️ 수수료 데이터 없음 - 최근 거래에서 수수료 정보를 추출할 수 없습니다');
      return c.json({
        success: true,
        fee_estimate: {
          average_fee: 0,
          min_fee: 0,
          max_fee: 0,
          transaction_count: 0,
          can_estimate: false,
          warning: '거래 이력이 있지만 수수료 정보를 추출할 수 없습니다. 최소 5건 이상의 거래(수수료 포함)가 필요합니다.'
        }
      });
    }

    // 평균, 최소, 최대 계산
    const averageFee = feesInTRX.reduce((a, b) => a + b, 0) / feesInTRX.length;
    const minFee = Math.min(...feesInTRX);
    const maxFee = Math.max(...feesInTRX);

    console.log(`💰 수수료 분석 완료: 평균=${averageFee.toFixed(6)} TRX, 최소=${minFee.toFixed(6)} TRX, 최대=${maxFee.toFixed(6)} TRX`);

    return c.json({
      success: true,
      fee_estimate: {
        average_fee: Number(averageFee.toFixed(6)),
        min_fee: Number(minFee.toFixed(6)),
        max_fee: Number(maxFee.toFixed(6)),
        transaction_count: feesInTRX.length,
        can_estimate: canEstimate,
        warning: !canEstimate 
          ? `현재 ${feesInTRX.length}건의 거래 수수료 데이터가 있습니다. 정확한 수수료 추정을 위해 최소 5건 이상의 거래가 필요합니다.`
          : undefined
      }
    });

  } catch (error: any) {
    console.error('❌ 수수료 추정 오류:', error);
    return c.json({
      success: false,
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * TXID 상세 조회
 * GET /make-server-b6d5667f/transaction/detail/:hash
 * 
 * 특정 거래의 상세 정보 조회
 * - 개발 모드 TXID (dev_로 시작): 인증 불필요
 * - 실제 TXID: Authorization 헤더 필수 (Bearer token)
 */
transactionRouter.get("/detail/:hash", async (c) => {
  try {
    const hash = c.req.param('hash');
    
    if (!hash) {
      return c.json({
        success: false,
        error: 'Transaction hash 필요'
      }, 400);
    }

    // 개발 모드 TXID가 아닌 경우만 Authorization 확인
    const isDevelopmentTx = hash.startsWith('dev_');
    if (!isDevelopmentTx) {
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({
          success: false,
          code: 401,
          message: 'Missing authorization header'
        }, 401);
      }
    }

    console.log(`🔍 거래 상세 조회: ${hash}`);

    // 개발 모드 TXID인 경우 mock 데이터 반환
    if (isDevelopmentTx) {
      console.log('📝 개발 모드: Mock 데이터 반환');
      const mockResult = {
        hash: hash,
        timestamp: Date.now(),
        block: 999999,
        from: 'TDevelopmentAddressForTesting1234567890AB',
        to: 'TDevelopmentAddressForTesting9876543210CD',
        confirmed: true,
        status: 'success',
        amount: '10.5',
        fee: '0.001',
        energy_fee: '0',
        net_fee: '0.001',
        contract_type: 1,
        token_info: {
          tokenId: '_',
          tokenAbbr: 'trx',
          tokenName: 'trx',
          tokenDecimal: 6,
          tokenCanShow: 1,
          tokenType: 'trc10'
        },
        tx_detail_url: `https://tronscan.org/#/transaction/${hash}`,
        development_mode: '개발 모드입니다'
      };

      return c.json({
        success: true,
        transaction: mockResult,
        message: '⚠️ 개발 모드 - Mock 데이터입니다'
      });
    }

    // TronScan transaction-info API 호출
    const response = await fetch(
      `${TRON_SCAN_API}/transaction-info?hash=${hash}&apikey=${TRON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TronScan API 오류: ${response.status}`);
    }

    const txDetail = await response.json();

    if (!txDetail.hash) {
      return c.json({
        success: false,
        error: '거래를 찾을 수 없습니다'
      }, 404);
    }

    // 응답 정보 변환
    const result = {
      hash: txDetail.hash,
      timestamp: txDetail.timestamp,
      block: txDetail.block,
      from: txDetail.ownerAddress,
      to: txDetail.toAddress,
      confirmed: txDetail.confirmed,
      status: txDetail.result === 'SUCCESS' ? 'success' : 'failed',
      amount: txDetail.amount ? (Number(txDetail.amount) / 1000000).toString() : '0', // SUN to TRX
      fee: txDetail.cost?.fee ? (txDetail.cost.fee / 1000000).toString() : '0', // SUN to TRX
      energy_fee: txDetail.cost?.energy_fee ? (txDetail.cost.energy_fee / 1000000).toString() : '0',
      net_fee: txDetail.cost?.net_fee ? (txDetail.cost.net_fee / 1000000).toString() : '0',
      contract_type: txDetail.contractType,
      token_info: txDetail.tokenInfo,
      tx_detail_url: `https://tronscan.org/#/transaction/${hash}`
    };

    console.log(`✅ 거래 상세 조회 완료: ${hash}`);

    return c.json({
      success: true,
      transaction: result
    });

  } catch (error: any) {
    console.error('❌ 거래 상세 조회 오류:', error);
    return c.json({
      success: false,
      error: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * 계정별 거래 통계
 * GET /make-server-b6d5667f/transaction/stats/:address
 */
transactionRouter.get("/stats/:address", async (c) => {
  try {
    const address = c.req.param('address');
    
    if (!address || !address.startsWith('T')) {
      return c.json({
        success: false,
        error: '유효한 TRON 주소가 필요합니다'
      }, 400);
    }

    console.log(`📊 거래 통계: ${address}`);

    // 거래 이력 조회
    const response = await fetch(
      `${TRON_SCAN_API}/transaction?address=${address}&limit=50&start=0&apikey=${TRON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TronScan API 오류: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return c.json({
        success: true,
        stats: {
          total_transactions: 0,
          success_count: 0,
          failed_count: 0,
          total_fees: '0',
          average_fee: '0',
          total_amount: '0'
        }
      });
    }

    // 통계 계산
    const successTxs = data.data.filter((tx: any) => tx.result === 'SUCCESS');
    const failedTxs = data.data.filter((tx: any) => tx.result !== 'SUCCESS');
    
    const totalFees = successTxs.reduce((sum: number, tx: any) => sum + (tx.cost?.fee || 0), 0) / 1000000;
    const totalAmount = data.data.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0) / 1000000;
    const averageFee = successTxs.length > 0 ? totalFees / successTxs.length : 0;

    const stats = {
      total_transactions: data.data.length,
      success_count: successTxs.length,
      failed_count: failedTxs.length,
      success_rate: (successTxs.length / data.data.length * 100).toFixed(2) + '%',
      total_fees: Number(totalFees.toFixed(6)).toString(),
      average_fee: Number(averageFee.toFixed(6)).toString(),
      total_amount: Number(totalAmount.toFixed(2)).toString()
    };

    console.log(`✅ 거래 통계 완료: ${stats.total_transactions}건`);

    return c.json({
      success: true,
      stats
    });

  } catch (error: any) {
    console.error('❌ 거래 통계 조회 오류:', error);
    return c.json({
      success: false,
      error: error.message || 'Unknown error'
    }, 500);
  }
});

export default transactionRouter;
