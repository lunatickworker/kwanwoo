// 트랜잭션 전송 및 관리 API
import { Hono } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2";

const transactionRouter = new Hono();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// ===== Biconomy Supertransaction API =====

const BICONOMY_API_URL = 'https://supertransaction.biconomy.io/api/v1';
const BICONOMY_API_KEY = Deno.env.get('BICONOMY_API_KEY') ?? '';

// ===== Network Type Detection =====
// RPC URL 기반으로 네트워크 타입 판단 (Chain ID는 내부 식별용)

/**
 * RPC URL로 Tron 네트워크인지 판단
 */
function isTronNetwork(rpcUrl: string | null): boolean {
  if (!rpcUrl) return false;
  return rpcUrl.includes('trongrid.io');
}

/**
 * RPC URL로 EVM 네트워크인지 판단
 */
function isEVMNetwork(rpcUrl: string | null): boolean {
  if (!rpcUrl) return true; // RPC URL 없으면 기본적으로 EVM으로 간주
  return !isTronNetwork(rpcUrl);
}

// ===== Tron Network Config =====
// RPC URL만으로 네트워크 구분
const TRON_MAINNET = 'https://api.trongrid.io';
const TRON_SHASTA = 'https://api.shasta.trongrid.io';
const TRON_NILE = 'https://nile.trongrid.io';

interface TransferRequest {
  fromWalletId: string;
  fromUserId: string;
  toAddress: string;
  amount: string;
  coinType: string;
  gasPayment?: {
    token?: string;
    sponsor?: boolean;
  };
}

interface TransactionReceipt {
  txHash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  timestamp?: string;
  confirmations?: number;
}

/**
 * POST /transaction/send
 * 출금 트랜잭션 전송
 */
transactionRouter.post('/send', async (c) => {
  try {
    const body: TransferRequest = await c.req.json();
    const { fromWalletId, fromUserId, toAddress, amount, coinType, gasPayment } = body;

    if ((!fromWalletId && !fromUserId) || !toAddress || !amount || !coinType) {
      return c.json({ 
        success: false, 
        error: '필수 파라미터가 누락되었습니다 (fromWalletId 또는 fromUserId 필요)' 
      }, 400);
    }

    console.log(`💸 출금 시작: ${amount} ${coinType} -> ${toAddress}`);

    // 1. 지갑 정보 조회 (with private key)
    let walletQuery = supabase
      .from('wallets')
      .select('wallet_id, address, encrypted_private_key, balance, coin_type, wallet_type, user_id');

    // fromWalletId 우선, 없으면 fromUserId + coinType으로 조회
    if (fromWalletId) {
      walletQuery = walletQuery.eq('wallet_id', fromWalletId);
    } else if (fromUserId) {
      walletQuery = walletQuery
        .eq('user_id', fromUserId)
        .eq('coin_type', coinType)
        .eq('wallet_type', 'hot'); // 출금은 Hot Wallet에서만
    }

    const { data: walletData, error: walletError } = await walletQuery.single();

    if (walletError || !walletData) {
      return c.json({ 
        success: false, 
        error: '지갑을 찾을 수 없습니다' 
      }, 404);
    }

    const actualWalletId = walletData.wallet_id;

    // Cold Wallet 출금 차단
    if (walletData.wallet_type === 'cold') {
      return c.json({
        success: false,
        error: 'Cold Wallet은 자동 출금이 불가능합니다. Hot Wallet으로 먼저 자산을 이동해주세요.'
      }, 403);
    }

    // 2. 잔액 확인
    const transferAmount = parseFloat(amount);
    if (walletData.balance < transferAmount) {
      return c.json({ 
        success: false, 
        error: `잔액 부족 (보유: ${walletData.balance}, 필요: ${transferAmount})` 
      }, 400);
    }

    // 3. 코인 정보 조회
    const { data: coinData, error: coinError } = await supabase
      .from('supported_tokens')
      .select('chain_id, contract_address, rpc_url')
      .eq('symbol', coinType)
      .single();

    if (coinError || !coinData) {
      return c.json({ 
        success: false, 
        error: '지원하지 않는 코인입니다' 
      }, 404);
    }

    // 4. Private Key 복호화
    console.log('🔓 Private Key 복호화 중...');
    const decryptResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-b6d5667f/wallet/decrypt-key`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ wallet_id: actualWalletId })
      }
    );

    const decryptResult = await decryptResponse.json();
    if (!decryptResult.success) {
      throw new Error('Private Key 복호화 실패');
    }

    const privateKey = decryptResult.privateKey;

    // 5. 네트워크 타입별 전송 로직 분기
    const chainId = coinData.chain_id;
    let txHash: string;
    let quote: any = null;

    if (isTronNetwork(coinData.rpc_url)) {
      // ===== Tron (TRC-20) 전송 =====
      console.log('🌐 Tron 네트워크 전송 시작...');
      
      const tronResult = await sendTronTransaction({
        privateKey,
        fromAddress: walletData.address,
        toAddress,
        amount,
        coinType,
        contractAddress: coinData.contract_address,
        rpcUrl: coinData.rpc_url
      });
      
      txHash = tronResult.txHash;
      console.log(`✅ Tron 트랜잭션 전송 완료: ${txHash}`);
      
    } else if (isEVMNetwork(coinData.rpc_url)) {
      // ===== EVM (Biconomy Supertransaction) 전송 =====
      console.log('🚀 Biconomy Supertransaction 실행 중...');
      
      // 5-1. Compose
      const composeResponse = await fetch(`${BICONOMY_API_URL}/compose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': BICONOMY_API_KEY
        },
        body: JSON.stringify({
          chainId: chainId,
          from: walletData.address,
          steps: [
            {
              type: 'transfer',
              token: coinType,
              to: toAddress,
              amount: amount
            }
          ],
          gasPayment: gasPayment || {
            sponsor: true // 기본: 플랫폼이 가스비 스폰서
          }
        })
      });

      const composeResult = await composeResponse.json();
      if (!composeResult.payload) {
        throw new Error('Compose 실패: ' + JSON.stringify(composeResult));
      }

      // 5-2. Sign (ECDSA 서명)
      console.log('✍️ ECDSA 서명 생성 중...');
      const signature = await signPayload(composeResult.payload, privateKey);

      // 5-3. Execute
      const executeResponse = await fetch(`${BICONOMY_API_URL}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': BICONOMY_API_KEY
        },
        body: JSON.stringify({
          payload: composeResult.payload,
          signature: signature
        })
      });

      const executeResult = await executeResponse.json();
      if (!executeResult.txHash) {
        throw new Error('Execute 실패: ' + JSON.stringify(executeResult));
      }

      txHash = executeResult.txHash;
      console.log(`✅ 트랜잭션 전송 완료: ${txHash}`);
      quote = composeResult.quote;
    } else {
      // 지원하지 않는 네트워크
      throw new Error(`지원하지 않는 네트워크입니다 (Chain ID: ${chainId})`);
    }

    // 6. withdrawals 테이블에 기록
    const { data: withdrawalData, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: walletData.user_id,
        coin_type: coinType,
        amount: transferAmount,
        to_address: toAddress,
        from_address: walletData.address,
        tx_hash: txHash,
        status: 'processing',
        fee: quote?.gasCost || 0
      })
      .select()
      .single();

    if (withdrawalError) {
      console.error('⚠️ withdrawals 기록 실패:', withdrawalError);
    }

    // 7. 잔액 차감
    await supabase
      .from('wallets')
      .update({ 
        balance: walletData.balance - transferAmount 
      })
      .eq('wallet_id', actualWalletId);

    // 8. Transaction Receipt 조회
    const receipt = await getTransactionReceipt(txHash, coinData.rpc_url);

    return c.json({
      success: true,
      txHash,
      receipt,
      withdrawal_id: withdrawalData?.withdrawal_id,
      quote
    });
  } catch (error: any) {
    console.error('❌ 출금 실패:', error);
    return c.json({
      success: false,
      error: error.message || '출금에 실패했습니다'
    }, 500);
  }
});

/**
 * GET /transaction/receipt/:txHash
 * Transaction Receipt 조회
 */
transactionRouter.get('/receipt/:txHash', async (c) => {
  try {
    const txHash = c.req.param('txHash');
    const chainId = c.req.query('chainId') || '8453'; // 기본: Base

    if (!txHash) {
      return c.json({ 
        success: false, 
        error: 'txHash가 필요합니다' 
      }, 400);
    }

    console.log(`🔍 Transaction Receipt 조회: ${txHash}`);

    const receipt = await getTransactionReceipt(txHash, parseInt(chainId));

    return c.json({
      success: true,
      receipt
    });
  } catch (error: any) {
    console.error('❌ Receipt 조회 실패:', error);
    return c.json({
      success: false,
      error: error.message || 'Receipt 조회에 실패했습니다'
    }, 500);
  }
});

/**
 * GET /transaction/status/:txHash
 * Biconomy Supertransaction 상태 조회
 */
transactionRouter.get('/status/:txHash', async (c) => {
  try {
    const txHash = c.req.param('txHash');

    if (!txHash) {
      return c.json({ 
        success: false, 
        error: 'txHash가 필요합니다' 
      }, 400);
    }

    console.log(`📊 Supertransaction 상태 조회: ${txHash}`);

    const statusResponse = await fetch(
      `${BICONOMY_API_URL}/status/${txHash}`,
      {
        headers: {
          'x-api-key': BICONOMY_API_KEY
        }
      }
    );

    const statusResult = await statusResponse.json();

    return c.json({
      success: true,
      status: statusResult.status,
      details: statusResult.details
    });
  } catch (error: any) {
    console.error('❌ 상태 조회 실패:', error);
    return c.json({
      success: false,
      error: error.message || '상태 조회에 실패했습니다'
    }, 500);
  }
});

/**
 * POST /transaction/move-to-cold
 * Hot Wallet → Cold Wallet 자산 이동 (내부 이동)
 */
transactionRouter.post('/move-to-cold', async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, coin_type, amount } = body;

    if (!user_id || !coin_type || !amount) {
      return c.json({ 
        success: false, 
        error: '필수 파라미터가 누락되었습니다' 
      }, 400);
    }

    const transferAmount = parseFloat(amount);
    console.log(`❄️ Hot → Cold 이동 시작: ${transferAmount} ${coin_type} (user: ${user_id})`);

    // 1. Hot Wallet 조회
    const { data: hotWallet, error: hotError } = await supabase
      .from('wallets')
      .select('wallet_id, balance')
      .eq('user_id', user_id)
      .eq('coin_type', coin_type)
      .eq('wallet_type', 'hot')
      .single();

    if (hotError || !hotWallet) {
      return c.json({ 
        success: false, 
        error: 'Hot Wallet을 찾을 수 없습니다' 
      }, 404);
    }

    // 2. 잔액 확인
    if (hotWallet.balance < transferAmount) {
      return c.json({ 
        success: false, 
        error: `잔액 부족 (보유: ${hotWallet.balance}, 필요: ${transferAmount})` 
      }, 400);
    }

    // 3. Cold Wallet 조회 (없으면 생성)
    let { data: coldWallet } = await supabase
      .from('wallets')
      .select('wallet_id, balance')
      .eq('user_id', user_id)
      .eq('coin_type', coin_type)
      .eq('wallet_type', 'cold')
      .single();

    if (!coldWallet) {
      // Cold Wallet 생성 (Private Key 없이 - 보관용)
      const { data: newColdWallet, error: createError } = await supabase
        .from('wallets')
        .insert({
          user_id,
          coin_type,
          address: `cold_${user_id}_${coin_type}_${Date.now()}`, // 임시 주소
          wallet_type: 'cold',
          balance: 0,
          status: 'active'
        })
        .select()
        .single();

      if (createError) {
        throw new Error('Cold Wallet 생성 실패: ' + createError.message);
      }

      coldWallet = newColdWallet;
      console.log('✅ Cold Wallet 생성:', coldWallet.wallet_id);
    }

    // 4. Hot Wallet 잔액 차감
    await supabase
      .from('wallets')
      .update({ balance: hotWallet.balance - transferAmount })
      .eq('wallet_id', hotWallet.wallet_id);

    // 5. Cold Wallet 잔액 증가
    await supabase
      .from('wallets')
      .update({ balance: coldWallet.balance + transferAmount })
      .eq('wallet_id', coldWallet.wallet_id);

    console.log(`✅ Hot → Cold 이동 완료: ${transferAmount} ${coin_type}`);

    return c.json({
      success: true,
      message: `${transferAmount} ${coin_type}이(가) Cold Wallet으로 이동되었습니다`,
      hot_balance: hotWallet.balance - transferAmount,
      cold_balance: coldWallet.balance + transferAmount
    });
  } catch (error: any) {
    console.error('❌ Hot → Cold 이동 실패:', error);
    return c.json({
      success: false,
      error: error.message || 'Hot → Cold 이동에 실패했습니다'
    }, 500);
  }
});

/**
 * POST /transaction/move-to-hot
 * Cold Wallet → Hot Wallet 자산 이동 (관리자 승인 필요)
 */
transactionRouter.post('/move-to-hot', async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, coin_type, amount } = body;

    if (!user_id || !coin_type || !amount) {
      return c.json({ 
        success: false, 
        error: '필수 파라미터가 누락되었습니다' 
      }, 400);
    }

    const transferAmount = parseFloat(amount);
    console.log(`🔥 Cold → Hot 이동 시작: ${transferAmount} ${coin_type} (user: ${user_id})`);

    // 1. Cold Wallet 조회
    const { data: coldWallet, error: coldError } = await supabase
      .from('wallets')
      .select('wallet_id, balance')
      .eq('user_id', user_id)
      .eq('coin_type', coin_type)
      .eq('wallet_type', 'cold')
      .single();

    if (coldError || !coldWallet) {
      return c.json({ 
        success: false, 
        error: 'Cold Wallet을 찾을 수 없습니다' 
      }, 404);
    }

    // 2. 잔액 확인
    if (coldWallet.balance < transferAmount) {
      return c.json({ 
        success: false, 
        error: `잔액 부족 (보유: ${coldWallet.balance}, 필요: ${transferAmount})` 
      }, 400);
    }

    // 3. Hot Wallet 조회
    const { data: hotWallet, error: hotError } = await supabase
      .from('wallets')
      .select('wallet_id, balance')
      .eq('user_id', user_id)
      .eq('coin_type', coin_type)
      .eq('wallet_type', 'hot')
      .single();

    if (hotError || !hotWallet) {
      return c.json({ 
        success: false, 
        error: 'Hot Wallet을 찾을 수 없습니다' 
      }, 404);
    }

    // 4. Cold Wallet 잔액 차감
    await supabase
      .from('wallets')
      .update({ balance: coldWallet.balance - transferAmount })
      .eq('wallet_id', coldWallet.wallet_id);

    // 5. Hot Wallet 잔액 증가
    await supabase
      .from('wallets')
      .update({ balance: hotWallet.balance + transferAmount })
      .eq('wallet_id', hotWallet.wallet_id);

    console.log(`✅ Cold → Hot 이동 완료: ${transferAmount} ${coin_type}`);

    return c.json({
      success: true,
      message: `${transferAmount} ${coin_type}이(가) Hot Wallet으로 이동되었습니다`,
      hot_balance: hotWallet.balance + transferAmount,
      cold_balance: coldWallet.balance - transferAmount
    });
  } catch (error: any) {
    console.error('❌ Cold → Hot 이동 실패:', error);
    return c.json({
      success: false,
      error: error.message || 'Cold → Hot 이동에 실패했습니다'
    }, 500);
  }
});

// ===== 헬퍼 함수 =====

/**
 * Transaction Receipt 조회
 * RPC를 통해 블록체인에서 직접 조회
 */
async function getTransactionReceipt(
  txHash: string, 
  rpcUrl: string
): Promise<TransactionReceipt> {
  try {
    // Tron 네트워크인 경우
    if (isTronNetwork(rpcUrl)) {
      return await getTronTransactionReceipt(txHash, rpcUrl);
    }
    
    // EVM 네트워크인 경우
    // JSON-RPC 호출: eth_getTransactionReceipt
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 1
      })
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message);
    }

    const receipt = result.result;

    if (!receipt) {
      // Receipt가 아직 없음 (트랜잭션이 아직 마이닝 안됨)
      return {
        txHash,
        status: 'pending'
      };
    }

    // Receipt 파싱
    const status = receipt.status === '0x1' ? 'completed' : 'failed';
    
    return {
      txHash,
      status,
      blockNumber: parseInt(receipt.blockNumber, 16),
      gasUsed: parseInt(receipt.gasUsed, 16).toString(),
      effectiveGasPrice: receipt.effectiveGasPrice 
        ? parseInt(receipt.effectiveGasPrice, 16).toString() 
        : undefined,
      timestamp: new Date().toISOString(),
      confirmations: receipt.confirmations || 0
    };
  } catch (error) {
    console.error('Receipt 조회 오류:', error);
    return {
      txHash,
      status: 'processing'
    };
  }
}

/**
 * ECDSA 서명 생성 (Ethereum 표준) - Web Crypto API 사용
 * @param payload - Biconomy에서 받은 payload 객체
 * @param privateKey - Private Key (0x 접두사 포함)
 * @returns Ethereum 서명 (0x + r + s + v 형식, 132자)
 */
async function signPayload(payload: any, privateKey: string): Promise<string> {
  try {
    // ethers.js를 동적으로 import하여 서명 생성
    const { Wallet } = await import('npm:ethers@6.13.0');
    
    // 1. Payload를 JSON 문자열로 변환
    const payloadString = JSON.stringify(payload);
    
    // 2. Private Key로 Wallet 생성
    const wallet = new Wallet(privateKey);
    
    // 3. Payload 메시지에 서명
    const signature = await wallet.signMessage(payloadString);
    
    console.log('✅ ECDSA 서명 완료:', signature.slice(0, 20) + '...');
    return signature;
  } catch (error) {
    console.error('❌ 서명 생성 실패:', error);
    throw new Error('ECDSA 서명 생성에 실패했습니다');
  }
}

/**
 * Tron 트랜잭션 전송
 * @param privateKey - Private Key (0x 접두사 포함)
 * @param fromAddress - 보내는 주소
 * @param toAddress - 받는 주소
 * @param amount - 전송할 양
 * @param coinType - 코인 타입 (TRC-20)
 * @param contractAddress - TRC-20 컨트랙트 주소
 * @param rpcUrl - RPC URL
 * @returns 트랜잭션 해시
 */
async function sendTronTransaction({
  privateKey,
  fromAddress,
  toAddress,
  amount,
  coinType,
  contractAddress,
  rpcUrl
}: {
  privateKey: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  coinType: string;
  contractAddress: string;
  rpcUrl: string;
}): Promise<{ txHash: string }> {
  try {
    // TronWeb은 npm 패키지이므로 동적 import 사용
    const TronWeb = (await import('npm:tronweb@6.0.0')).default;
    
    const tronWeb = new TronWeb({
      fullHost: rpcUrl,
      privateKey: privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
    });

    // TRC-20 전송
    const contract = await tronWeb.contract().at(contractAddress);
    
    // amount를 Sun 단위로 변환 (1 TRX = 10^6 Sun)
    const amountInSun = tronWeb.toSun(amount);
    
    const transaction = await contract.transfer(
      toAddress, // Tron 주소는 Base58 형식 그대로 사용
      amountInSun
    ).send({
      feeLimit: 100000000 // 100 TRX
    });

    return {
      txHash: transaction
    };
  } catch (error: any) {
    console.error('❌ Tron 트랜잭션 전송 실패:', error);
    throw new Error(`Tron 전송 실패: ${error.message || '알 수 없는 오류'}`);
  }
}

/**
 * Tron Transaction Receipt 조회
 * @param txHash - 트랜잭션 해시
 * @param rpcUrl - RPC URL
 * @returns Transaction Receipt
 */
async function getTronTransactionReceipt(
  txHash: string, 
  rpcUrl: string
): Promise<TransactionReceipt> {
  try {
    // TronWeb은 npm 패키지이므로 동적 import 사용
    const TronWeb = (await import('npm:tronweb@6.0.0')).default;
    
    const tronWeb = new TronWeb({
      fullHost: rpcUrl
    });

    // 트랜잭션 조회
    const transaction = await tronWeb.trx.getTransactionInfo(txHash);

    if (!transaction || !transaction.receipt) {
      // 트랜잭션이 아직 마이닝 안됨
      return {
        txHash,
        status: 'pending'
      };
    }

    // 트랜잭션 상태 파싱
    const status = transaction.receipt.result === 'SUCCESS' ? 'completed' : 'failed';
    
    return {
      txHash,
      status,
      blockNumber: transaction.blockNumber || 0,
      gasUsed: (transaction.receipt.energy_usage_total || 0).toString(),
      effectiveGasPrice: (transaction.receipt.energy_fee || 0).toString(),
      timestamp: transaction.block_timestamp 
        ? new Date(transaction.block_timestamp).toISOString() 
        : new Date().toISOString(),
      confirmations: transaction.confirmations || 0
    };
  } catch (error) {
    console.error('Tron Receipt 조회 오류:', error);
    return {
      txHash,
      status: 'processing'
    };
  }
}

export default transactionRouter;
