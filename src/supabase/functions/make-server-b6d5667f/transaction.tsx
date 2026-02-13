// 트랜잭션 전송 및 관리 API
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "jsr:@supabase/supabase-js@2";

const transactionRouter = new Hono();

// CORS 설정
transactionRouter.use(
  '/*',
  cors({
    origin: ['http://localhost:3001', 'http://localhost:5173', 'https://kwanwoo-coin.vercel.app'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'apikey',
      'x-client-info',
      'x-supabase-auth',
      'x-supabase-client-version'
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400
  })
);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// ===== Endpoint 라우팅 미들웨어 =====
transactionRouter.post('/', async (c) => {
  try {
    console.log('🔄 [transactionRouter POST /] 핸들러 도달!');
    console.log('   Method:', c.req.method);
    console.log('   Path:', c.req.path);
    console.log('   URL:', c.req.url);
    
    const body = await c.req.json();
    console.log('📥 Request body:', { 
      endpoint: body.endpoint, 
      userId: body.userId?.substring(0, 8) 
    });
    
    const endpoint = body.endpoint;

    if (!endpoint) {
      console.error('❌ endpoint 누락');
      return c.json({ 
        success: false, 
        error: 'endpoint가 필요합니다' 
      }, 400);
    }

    console.log(`📍 라우팅: ${endpoint}`);

    // endpoint에 따라 적절한 핸들러 호출
    if (endpoint === '/swap/tron') {
      return await handleSwapTron(c, body);
    } else {
      return c.json({ 
        success: false, 
        error: `지원하지 않는 endpoint: ${endpoint}` 
      }, 400);
    }
  } catch (error: any) {
    console.error('❌ Endpoint 라우팅 실패:', error);
    return c.json({
      success: false,
      error: error.message || 'endpoint 처리 실패'
    }, 500);
  }
});

// ===== Endpoint 핸들러 =====
async function handleSwapTron(c: any, body: any) {
  const {
    userId,
    fromCoin,
    toCoin,
    fromAmount,
    toAmount,
    exchangeRate,
    fee
  } = body;

  try {
    console.log(`🔄 [TRON Swap] 요청: ${fromAmount} ${fromCoin} -> ${toAmount} ${toCoin}`);

    // ✅ 빠른 검증만 수행 후 바로 반환 (타임아웃 방지)
    
    // 1. 기본 파라미터 검증
    if (!userId || !fromCoin || !toCoin || !fromAmount || !toAmount) {
      return c.json({
        success: false,
        error: '필수 파라미터 누락'
      }, 400);
    }

    // 2. 지갑 존재 여부만 빠르게 확인
    const { data: walletData, error: walletError } = await supabase
      .from('wallets')
      .select('wallet_id, address, encrypted_private_key, coin_type, user_id')
      .eq('user_id', userId)
      .eq('coin_type', fromCoin)
      .single();

    if (walletError || !walletData?.encrypted_private_key) {
      console.error('❌ 지갑 조회 실패:', walletError);
      return c.json({
        success: false,
        error: '지갑 정보를 찾을 수 없습니다'
      }, 404);
    }

    // 3. 토큰 정보를 DB에서 조회 (contract addresses)
    console.log(`🔍 토큰 정보 조회 중: ${fromCoin}, ${toCoin}`);
    
    const { data: fromTokenData, error: fromError } = await supabase
      .from('supported_tokens')
      .select('contract_address, decimals')
      .eq('symbol', fromCoin)
      .single();
    
    const { data: toTokenData, error: toError } = await supabase
      .from('supported_tokens')
      .select('contract_address, decimals')
      .eq('symbol', toCoin)
      .single();
    
    if (fromError || toError) {
      console.error(`❌ 토큰 정보 조회 실패:`, { fromError, toError });
      return c.json({
        success: false,
        error: `토큰 정보 조회 실패: ${fromCoin} 또는 ${toCoin}`
      }, 400);
    }

    // 유효하지 않은 주소는 NULL로 변환 (processSwapAsync에서 WTRX lookup 트리거)
    console.log('🔍 주소 유효성 pre-check (DB에서 가져온 주소)...');
    
    if (fromTokenData?.contract_address && !isValidTronAddress(fromTokenData.contract_address)) {
      console.warn(`⚠️ ${fromCoin}의 DB 주소가 invalid (${fromTokenData.contract_address.length}자), NULL로 설정`);
      fromTokenData.contract_address = null;
    }
    
    if (toTokenData?.contract_address && !isValidTronAddress(toTokenData.contract_address)) {
      console.warn(`⚠️ ${toCoin}의 DB 주소가 invalid (${toTokenData.contract_address.length}자), NULL로 설정`);
      toTokenData.contract_address = null;
    }

    const tokenAddresses: Record<string, string> = {
      [fromCoin]: fromTokenData.contract_address,
      [toCoin]: toTokenData.contract_address
    };

    console.log(`✅ 토큰 정보 조회 완료:`, {
      [fromCoin]: tokenAddresses[fromCoin],
      [toCoin]: tokenAddresses[toCoin]
    });

    // 4. DB에 pending 상태로 저장 (즉시 반환)
    const { data: swapRecord, error: insertError } = await supabase
      .from('coin_swaps')
      .insert({
        user_id: userId,
        from_coin: fromCoin,
        to_coin: toCoin,
        from_amount: parseFloat(fromAmount.toString()),
        to_amount: parseFloat(toAmount.toString()),
        exchange_rate: parseFloat(exchangeRate.toString()),
        fee: parseFloat(fee.toString()),
        fee_coin: toCoin,
        status: 'processing',
        tx_hash: null,
        method: 'standard',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ DB 저장 실패:', insertError);
      return c.json({
        success: false,
        error: 'DB 저장 실패'
      }, 500);
    }

    console.log(`⏳ 스왑 처리 시작: ${swapRecord.swap_id}`);

    // 5. 백그라운드에서 비동기로 스왑 처리 (타임아웃 없음)
    processSwapAsync(userId, fromCoin, toCoin, fromAmount, toAmount, exchangeRate, fee, walletData, swapRecord.swap_id, tokenAddresses);

    // 6. 즉시 처리 중 상태로 반환 (클라이언트는 폴링으로 상태 확인)
    return c.json({
      success: true,
      status: 'processing',
      swap_id: swapRecord.swap_id,
      message: '스왑이 처리 중입니다. 잠시 후 결과를 확인해주세요.'
    }, 202);

  } catch (error: any) {
    console.error('❌ [TRON Swap] 요청 처리 실패:', error.message);

    return c.json({
      success: false,
      error: error.message || 'TRON 스왑 요청 실패'
    }, 500);
  }
}

/**
 * 백그라운드에서 스왑 비동기 처리
 * 타임아웃 없이 완료될 때까지 실행
 */
async function processSwapAsync(
  userId: string,
  fromCoin: string,
  toCoin: string,
  fromAmount: string | number,
  toAmount: string | number,
  exchangeRate: string | number,
  fee: string | number,
  walletData: any,
  swapId: string,
  tokenAddresses: Record<string, string>
) {
  try {
    console.log(`🔄 [비동기] 스왑 처리 시작: ${swapId}`);

    // 1. 개인키 복호화
    console.log('🔑 개인키 복호화 중...');
    const decryptedPrivateKey = await Promise.race([
      decryptPrivateKey(walletData.encrypted_private_key),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('개인키 복호화 타임아웃')), 10000)
      )
    ]) as string;

    // 2. TronWeb 초기화
    console.log('⚙️ TronWeb 초기화 중...');
    let TronWebClass: any;
    let tronweb: any;
    
    try {
      // v6 시도
      const TronWebModule = await import('npm:tronweb@6');
      console.log('📦 TronWeb@6 모듈 로드됨');
      
      // v6는 TronWeb을 named export로 포함
      TronWebClass = TronWebModule.TronWeb || TronWebModule.default || TronWebModule;
      console.log(`📦 TronWeb@6 구조의 키:`, Object.keys(TronWebModule).slice(0, 10));
      
      // 초기화 시도
      tronweb = new TronWebClass({
        fullHost: 'https://api.trongrid.io',
        privateKey: decryptedPrivateKey,
        headers: { "TRON-PRO-API-KEY": Deno.env.get('TRON_API_KEY') || '' }
      });
      console.log('✅ TronWeb@6 초기화 완료');
    } catch (e6) {
      console.log('⚠️ TronWeb@6 실패, v5 시도:', e6.message);
      
      try {
        // v5 시도
        const TronWebModule = await import('npm:tronweb@5.4.0');
        console.log('📦 TronWeb@5 모듈 로드됨');
        
        TronWebClass = TronWebModule.default || TronWebModule;
        tronweb = new TronWebClass({
          fullHost: 'https://api.trongrid.io',
          privateKey: decryptedPrivateKey,
          headers: { "TRON-PRO-API-KEY": Deno.env.get('TRON_API_KEY') || '' }
        });
        console.log('✅ TronWeb@5 초기화 완료');
      } catch (e5) {
        throw new Error(`TronWeb 초기화 실패 (v6: ${e6.message}, v5: ${e5.message})`);
      }
    }

    // 3. 스왑 실행 (타임아웃 30초)
    console.log('🔄 JustSwap 호출 중...');
    let fromToken = tokenAddresses[fromCoin];
    let toToken = tokenAddresses[toCoin];
    
    // DB에서 JustSwap Router 주소 조회
    console.log('🔍 JustSwap Router 주소 조회 중...');
    const { data: routerData, error: routerError } = await supabase
      .from('supported_tokens')
      .select('contract_address')
      .eq('symbol', 'JUSTSWAP_ROUTER_V2')
      .single();
    
    if (routerError || !routerData?.contract_address) {
      console.error(`❌ JustSwap Router 주소 조회 실패:`, routerError);
      throw new Error(`JustSwap Router 주소를 찾을 수 없습니다. DB 설정을 확인하세요.`);
    }
    
    let routerAddress = routerData.contract_address;
    console.log(`✅ JustSwap Router 주소 조회 완료:`, routerAddress);
    
    const amountOutMin = Math.floor(Number(toAmount) * 0.99);

    // TRX is native token - need WTRX (Wrapped TRX) for swaps
    // Query database for WTRX address if needed
    if (!fromToken || fromToken === 'NULL') {
      console.log(`⚠️ ${fromCoin}은 native token (NULL contract), WTRX 조회 중...`);
      const { data: wtrxData, error: wtrxError } = await supabase
        .from('supported_tokens')
        .select('contract_address, symbol')
        .ilike('symbol', '%WTRX%')
        .single();
      
      if (wtrxData?.contract_address && wtrxData.contract_address !== 'NULL' && isValidTronAddress(wtrxData.contract_address)) {
        fromToken = wtrxData.contract_address;
        console.log(`✅ ${fromCoin} WTRX 주소 조회 완료 (${wtrxData.symbol}):`, fromToken);
      } else {
        console.error(`❌ 유효하지 않은 WTRX 주소:`, wtrxData?.contract_address);
        throw new Error(`유효하지 않은 WTRX 주소가 DB에 저장됨. 관리자에게 문의하세요. (주소: ${wtrxData?.contract_address})`);
      }
    }
    
    if (!toToken || toToken === 'NULL') {
      console.log(`⚠️ ${toCoin}은 native token (NULL contract), WTRX 조회 중...`);
      const { data: wtrxData, error: wtrxError } = await supabase
        .from('supported_tokens')
        .select('contract_address, symbol')
        .ilike('symbol', '%WTRX%')
        .single();
      
      if (wtrxData?.contract_address && wtrxData.contract_address !== 'NULL' && isValidTronAddress(wtrxData.contract_address)) {
        toToken = wtrxData.contract_address;
        console.log(`✅ ${toCoin} WTRX 주소 조회 완료 (${wtrxData.symbol}):`, toToken);
      } else {
        console.error(`❌ 유효하지 않은 WTRX 주소:`, wtrxData?.contract_address);
        throw new Error(`유효하지 않은 WTRX 주소가 DB에 저장됨. 관리자에게 문의하세요. (주소: ${wtrxData?.contract_address})`);
      }
    }

    console.log('🔍 주소 변환 전:', {
      fromToken,
      toToken,
      routerAddress,
      userAddressBase58: walletData.address,
      fromCoin,
      toCoin
    });

    // Address validation before Hex conversion
    console.log('🔎 주소 유효성 검사 중...');
    
    if (!isValidTronAddress(fromToken, tronweb)) {
      console.error(`❌ 유효하지 않은 fromToken 주소:`, fromToken);
      throw new Error(`${fromCoin}의 contract address가 유효하지 않습니다. (${fromToken}) DB 설정을 확인하세요.`);
    }
    
    if (!isValidTronAddress(toToken, tronweb)) {
      console.error(`❌ 유효하지 않은 toToken 주소:`, toToken);
      throw new Error(`${toCoin}의 contract address가 유효하지 않습니다. (${toToken}) DB 설정을 확인하세요.`);
    }
    
    if (!isValidTronAddress(routerAddress, tronweb)) {
      console.error(`❌ 유효하지 않은 routerAddress 주소:`, routerAddress);
      throw new Error(`JustSwap Router 주소가 유효하지 않습니다. (${routerAddress})`);
    }
    
    if (!isValidTronAddress(walletData.address, tronweb)) {
      console.error(`❌ 유효하지 않은 userAddress 주소:`, walletData.address);
      throw new Error(`사용자 지갑 주소가 유효하지 않습니다. (${walletData.address})`);
    }
    
    console.log('✅ 모든 주소 유효성 검사 통과');

    // 4. 스왑 전 계정 활성화 확인
    console.log('🔍 계정 활성화 상태 확인 중...');
    try {
      const account = await tronweb.trx.getAccount(walletData.address);
      
      if (!account || !account.address) {
        console.error('❌ 계정이 활성화되지 않았습니다');
        throw new Error(
          `❌ 계정 미활성화: ${walletData.address}\n` +
          `해결책: 먼저 이 주소로 최소 1 TRX를 수신해서 계정을 활성화하세요.`
        );
      }
      
      const trxBalance = await tronweb.trx.getBalance(walletData.address);
      const trxBalanceInTRX = tronweb.fromSun(trxBalance);
      
      if (trxBalance < 3000000) { // 3 TRX 이하
        console.warn(`⚠️ TRX 잔액 부족: ${trxBalanceInTRX} TRX (최소 3 TRX 권장)`);
        throw new Error(
          `⚠️ TRX 잔액 부족 (${trxBalanceInTRX} TRX)\n` +
          `스왑을 위해서는 최소 3 TRX 이상의 가스비가 필요합니다.`
        );
      }
      
      console.log(`✅ 계정 활성화 확인 완료 (TRX: ${trxBalanceInTRX})`);
    } catch (accountError: any) {
      console.error('❌ 계정 확인 실패:', accountError.message);
      throw accountError;
    }

    // TronWeb.transactionBuilder.triggerSmartContract()는 Hex 형식을 요구하므로 변환
    let fromTokenHex: string, toTokenHex: string, routerAddressHex: string, userAddressHex: string;
    
    try {
      fromTokenHex = tronweb.address.toHex(fromToken);
      console.log('✅ fromToken Hex 변환:', fromTokenHex);
    } catch (e: any) {
      console.error('❌ fromToken Hex 변환 실패:', { token: fromToken, error: e.message });
      throw new Error(`fromToken Hex 변환 실패: ${e.message}`);
    }

    try {
      toTokenHex = tronweb.address.toHex(toToken);
      console.log('✅ toToken Hex 변환:', toTokenHex);
    } catch (e: any) {
      console.error('❌ toToken Hex 변환 실패:', { token: toToken, error: e.message });
      throw new Error(`toToken Hex 변환 실패: ${e.message}`);
    }

    try {
      routerAddressHex = tronweb.address.toHex(routerAddress);
      console.log('✅ routerAddress Hex 변환:', routerAddressHex);
    } catch (e: any) {
      console.error('❌ routerAddress Hex 변환 실패:', { address: routerAddress, error: e.message });
      throw new Error(`routerAddress Hex 변환 실패: ${e.message}`);
    }

    try {
      userAddressHex = tronweb.address.toHex(walletData.address);
      console.log('✅ userAddress Hex 변환:', userAddressHex);
    } catch (e: any) {
      console.error('❌ userAddress Hex 변환 실패:', { address: walletData.address, error: e.message });
      throw new Error(`userAddress Hex 변환 실패: ${e.message}`);
    }

    // 주소 검증 및 로깅
    console.log('📋 스왑 파라미터 (Hex 변환 완료):', {
      router: routerAddressHex,
      fromToken: fromTokenHex,
      toToken: toTokenHex,
      fromAmount: Math.floor(Number(fromAmount)),
      amountOutMin,
      userAddress: userAddressHex,
      userAddressBase58: walletData.address,
      timestamp: Math.floor(Date.now() / 1000)
    });

    // 4-1. fromToken 승인 (Approve)
    console.log('🔐 fromToken 승인 중...');
    try {
      const tokenContract = await tronweb.contract().at(fromTokenHex);
      const approveAmount = '999999999999999999999999999'; // 무제한 승인
      
      const approveTx = await Promise.race([
        tokenContract.approve(routerAddressHex, approveAmount).send({
          feeLimit: 100000000
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Approve 타임아웃')), 30000)
        )
      ]) as any;
      
      console.log('✅ fromToken 승인 완료:', approveTx);
    } catch (approveError: any) {
      console.error('⚠️ Approve 호출 중 에러 (계속 진행):', approveError.message);
    }

    // 4-2. JustSwap 스왑 호출
    let transaction: any;
    try {
      transaction = await Promise.race([
        tronweb.transactionBuilder.triggerSmartContract(
          routerAddressHex,
          'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
          { feeLimit: 100000000 },
          [
            { type: 'uint256', value: Math.floor(Number(fromAmount)) },
            { type: 'uint256', value: Math.floor(amountOutMin) },
            { type: 'address[]', value: [fromTokenHex, toTokenHex] },
            { type: 'address', value: userAddressHex },
            { type: 'uint256', value: Math.floor(Date.now() / 1000) + 300 }
          ]
        ),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('JustSwap 타임아웃 (30초)')), 30000)
        )
      ]) as any;
    } catch (swapError: any) {
      console.error('❌ JustSwap 호출 실패:', {
        message: swapError.message,
        router: routerAddressHex,
        fromToken: fromTokenHex,
        toToken: toTokenHex
      });
      throw swapError;
    }

    if (!transaction?.result?.result) {
      const errorMsg = transaction?.result?.message || transaction?.result || 'Unknown error';
      console.error('❌ 트랜잭션 검증 실패:', {
        result: transaction?.result,
        transaction: transaction?.transaction ? 'present' : 'missing'
      });
      throw new Error(`트랜잭션 검증 실패: ${errorMsg}`);
    }

    // 4. 서명 및 브로드캐스트
    console.log('✍️ 트랜잭션 서명 중...');
    const signedTransaction = await Promise.race([
      tronweb.trx.sign(transaction.transaction),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('서명 타임아웃')), 10000)
      )
    ]) as any;

    console.log('📡 네트워크 브로드캐스트 중...');
    const broadcastResult = await Promise.race([
      tronweb.trx.sendRawTransaction(signedTransaction),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('브로드캐스트 타임아웃')), 15000)
      )
    ]) as any;

    if (!broadcastResult?.result) {
      throw new Error(`브로드캐스트 실패: ${broadcastResult?.message || 'Unknown error'}`);
    }

    const txHash = broadcastResult.txid || broadcastResult.transaction?.txID;

    // 5. DB 업데이트 (성공)
    console.log(`✅ 스왑 완료: ${txHash}`);
    const { error: updateError } = await supabase
      .from('coin_swaps')
      .update({
        status: 'completed',
        tx_hash: txHash,
        updated_at: new Date().toISOString()
      })
      .eq('swap_id', swapId);

    if (updateError) {
      console.error('⚠️ DB 업데이트 실패:', updateError);
    }

  } catch (error: any) {
    console.error(`❌ [비동기] 스왑 실패 (${swapId}):`, error.message);

    // DB 업데이트 (실패)
    try {
      await supabase
        .from('coin_swaps')
        .update({
          status: 'failed',
          tx_hash: null,
          updated_at: new Date().toISOString()
        })
        .eq('swap_id', swapId);
    } catch (dbError) {
      console.error('⚠️ DB 업데이트 실패:', dbError);
    }
  }
}

// ===== Wallet Encryption =====
const WALLET_ENCRYPTION_KEY = Deno.env.get('WALLET_ENCRYPTION_KEY') ?? 'default-encryption-key-please-change-in-production';

/**
 * AES-GCM 복호화 (wallet.tsx와 동일한 로직)
 */
async function decryptPrivateKey(encryptedData: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const { iv, data } = JSON.parse(encryptedData);
    
    // 256-bit key 생성 (암호화할 때와 동일)
    const keyMaterial = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(WALLET_ENCRYPTION_KEY)
    );
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      'AES-GCM',
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(data)
    );
    
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Private key 복호화 실패');
  }
}

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

    console.log('📊 지갑 조회 결과:', {
      wallet_id: walletData.wallet_id,
      address: walletData.address,
      address_length: walletData.address?.length,
      address_starts_with: walletData.address?.substring(0, 5),
      coin_type: walletData.coin_type,
      balance: walletData.balance,
      wallet_type: walletData.wallet_type
    });

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
    console.log(`🔍 코인 정보 조회 중: ${coinType}`);
    const { data: coinData, error: coinError } = await supabase
      .from('supported_tokens')
      .select('chain_id, contract_address, rpc_url, network')
      .eq('symbol', coinType)
      .single();

    if (coinError) {
      console.error(`❌ 코인 조회 에러: ${coinType}`, coinError);
      return c.json({ 
        success: false, 
        error: `코인 정보 조회 실패: ${coinError.message}` 
      }, 404);
    }

    if (!coinData) {
      console.error(`❌ 지원하지 않는 코인: ${coinType}`);
      return c.json({ 
        success: false, 
        error: `지원하지 않는 코인입니다: ${coinType}` 
      }, 404);
    }

    console.log(`✅ 코인 정보 조회 완료:`, {
      symbol: coinType,
      network: coinData.network,
      chain_id: coinData.chain_id,
      has_contract: !!coinData.contract_address,
      has_rpc: !!coinData.rpc_url
    });

    // 4. Private Key 복호화 (직접 복호화)
    console.log('🔓 Private Key 복호화 중...', { walletId: actualWalletId });
    
    if (!walletData.encrypted_private_key) {
      throw new Error('Private Key가 저장되지 않았습니다');
    }

    console.log('✅ encrypted_private_key 조회 완료');

    // 직접 복호화 (같은 WALLET_ENCRYPTION_KEY로 복호화)
    let privateKey: string;
    try {
      privateKey = await decryptPrivateKey(walletData.encrypted_private_key);
      console.log('✅ Private Key 복호화 완료');
    } catch (error: any) {
      console.error('❌ Private Key 복호화 실패:', {
        message: error.message,
        name: error.name
      });
      throw new Error(`Private Key 복호화 실패: ${error.message}`);
    }

    // 5. 네트워크 타입별 전송 로직 분기
    const chainId = coinData.chain_id;
    let txHash: string;
    let quote: any = null;

    if (isTronNetwork(coinData.rpc_url)) {
      // ===== Tron (TRC-20) 전송 =====
      console.log('🌐 Tron 네트워크 전송 시작...', {
        from: walletData.address,
        to: toAddress,
        amount: amount,
        contract: coinData.contract_address,
        rpc: coinData.rpc_url?.substring(0, 30) + '...'
      });

      // ⚠️ TRON TRC-20 전송 전 TRX 가스비 확인
      if (coinType !== 'TRX') {
        console.log('💰 TRX 잔액 확인 중 (가스비 check)...');
        try {
          let tronWeb: any;
          try {
            const TronWebModule = await import('npm:tronweb@6');
            const TronWebClass = TronWebModule.TronWeb || TronWebModule.default || TronWebModule;
            tronWeb = new TronWebClass({ fullHost: coinData.rpc_url });
          } catch {
            const TronWebModule = await import('npm:tronweb@5.4.0');
            const TronWebClass = TronWebModule.default || TronWebModule;
            tronWeb = new TronWebClass({ fullHost: coinData.rpc_url });
          }
          
          const trxBalance = await tronWeb.trx.getBalance(walletData.address);
          const trxBalanceInTRX = tronWeb.fromSun(trxBalance);
          
          console.log('📊 TRX 잔액:', {
            sun: trxBalance,
            trx: trxBalanceInTRX
          });

          // 가스비 부족 체크 (대략 1 TRX = 최대 100 TRX 수수료 필요)
          // 안전하게 최소 1 TRX 필요
          if (trxBalance < 1000000) { // 1 TRX = 1,000,000 Sun
            throw new Error(`⚠️ TRX 잔액 부족: ${trxBalanceInTRX} TRX\n최소 1 TRX 이상의 가스비가 필요합니다. 주소에 TRX를 충전해주세요.`);
          }
        } catch (error: any) {
          if (error.message.includes('⚠️')) {
            throw error; // 이미 파싱된 에러는 그대로 throw
          }
          console.warn('⚠️ TRX 잔액 확인 실패 (계속 진행):', error.message);
        }
      }
      
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
    console.error('❌ 출금 실패:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return c.json({
      success: false,
      error: error.message || '출금에 실패했습니다',
      details: error.name
    }, 500);
  }
});

/**
 * GET /transaction/receipt/:txHash
 * Transaction Receipt 조회
 *//**
 * GET /receipt/:txHash
 * Transaction Receipt 조회
 */transactionRouter.get('/receipt/:txHash', async (c) => {
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
 * TRON 주소 유효성 검사 (체크섬 포함)
 * @param address - TRON address (Base58 format)
 * @param tronweb - TronWeb instance for validation
 * @returns true if valid, false otherwise
 */
function isValidTronAddress(address: string | null, tronweb?: any): boolean {
  if (!address || typeof address !== 'string') {
    console.error('❌ 주소 null/type 검사 실패:', { address, type: typeof address });
    return false;
  }
  
  // 1. 기본 형식 검사 (길이와 시작 문자)
  const basicValid = address.length === 34 && address.startsWith('T');
  
  if (!basicValid) {
    console.error(`❌ 주소 기본 형식 검사 실패:`, { 
      address, 
      length: address.length, 
      startsWith_T: address.startsWith('T'),
      expected: '34 chars starting with T'
    });
    return false;
  }
  
  // 2. TronWeb instance가 있으면 체크섬 검증 (더 정확한 검증)
  if (tronweb) {
    try {
      // TronWeb의 toHex() 메서드는 유효하지 않은 주소면 에러 발생
      // 미리 체크하기 위해 isAddress() 사용
      const isValidAddress = tronweb.isAddress(address);
      if (!isValidAddress) {
        console.error(`❌ TRON 체크섬 검증 실패:`, { address });
        return false;
      }
      console.log(`✅ TRON 체크섬 검증 통과:`, { address, length: address.length });
      return true;
    } catch (e: any) {
      console.error(`❌ TRON 체크섬 검증 에러:`, { address, error: e.message });
      return false;
    }
  }
  
  // 3. TronWeb instance 없으면 기본 형식만 검증
  console.log(`✅ 주소 기본 형식 검사 통과:`, { address, length: address.length });
  return true;
}

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
    console.log('🔌 TronWeb 초기화 중...', { 
      from: fromAddress.substring(0, 10),
      to: toAddress.substring(0, 10),
      amount,
      contract: contractAddress?.substring(0, 15),
      rpc: rpcUrl?.substring(0, 30)
    });

    // TronWeb은 npm 패키지이므로 동적 import 사용
    const keyToUse = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    console.log('🔑 Private Key 포맷:', { 
      original_length: privateKey.length,
      final_length: keyToUse.length,
      starts_with_0x: privateKey.startsWith('0x')
    });

    const TronWebImp = await import('npm:tronweb@6').catch(() => import('npm:tronweb@5.4.0'));
    const TronWebClass = TronWebImp.default || TronWebImp;
    const tronWeb = new TronWebClass({ fullHost: rpcUrl, privateKey: keyToUse });
    console.log('✅ TronWeb 초기화 완료');

    // TRC-20 전송
    console.log('📋 컨트랙트 로드 중...');
    const contract = await tronWeb.contract().at(contractAddress);
    console.log('✅ 컨트랙트 로드 완료');
    
    // amount를 Sun 단위로 변환 (1 TRX = 10^6 Sun)
    const amountInSun = tronWeb.toSun(amount);
    console.log('💰 금액 변환:', { 
      original: amount,
      inSun: amountInSun.toString()
    });
    
    console.log('📤 transfer 호출 중...', { 
      to: toAddress,
      amount: amountInSun.toString()
    });
    
    const transactionResult = await contract.transfer(
      toAddress, // Tron 주소는 Base58 형식 그대로 사용
      amountInSun
    ).send({
      feeLimit: 100000000 // 100 TRX
    });

    console.log('✅ 트랜잭션 전송 결과:', {
      type: typeof transactionResult,
      is_string: typeof transactionResult === 'string',
      value: typeof transactionResult === 'string' ? transactionResult : Object.keys(transactionResult || {})
    });

    // transactionResult가 문자열(txHash)이거나 객체(receipt)일 수 있음
    const txHash = typeof transactionResult === 'string' ? transactionResult : transactionResult?.txID || transactionResult?.transactionHash || transactionResult?.hash;
    
    if (!txHash) {
      console.error('❌ txHash 추출 실패:', transactionResult);
      throw new Error('txHash를 추출할 수 없습니다');
    }

    console.log('✅ txHash 추출 완료:', txHash.substring(0, 20) + '...');

    return {
      txHash
    };
  } catch (error: any) {
    const errorMessage = error.message || '알 수 없는 오류';
    
    console.error('❌ Tron 트랜잭션 전송 실패:', {
      message: errorMessage,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5)
    });

    // TRON 에러 메시지 파싱 및 변환
    let userFriendlyError = errorMessage;

    if (errorMessage.includes('account') && errorMessage.includes('does not exist')) {
      userFriendlyError = `⚠️ TRON 계정 활성화 필요: 최소 420 Sun (≈0.00042 TRX)의 TRX 잔액이 필요합니다. 현재 TRX 잔액을 확인해주세요.`;
    } else if (errorMessage.includes('insufficient balance')) {
      userFriendlyError = '❌ TRX 잔액 부족: 트랜잭션 수수료를 충당할 수 없습니다.';
    } else if (errorMessage.includes('energy insufficient')) {
      userFriendlyError = '❌ 에너지 부족: TRON 네트워크 트랜잭션 에너지가 부족합니다.';
    } else if (errorMessage.includes('permission') || errorMessage.includes('witness')) {
      userFriendlyError = '❌ 권한 오류: 이 계정으로는 거래할 수 없습니다.';
    }

    console.error('🔄 사용자 친화적 에러:', userFriendlyError);
    throw new Error(userFriendlyError);
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
    let tronWeb: any;
    try {
      const TronWebModule = await import('npm:tronweb@6');
      const TronWebClass = TronWebModule.TronWeb || TronWebModule.default || TronWebModule;
      tronWeb = new TronWebClass({ fullHost: rpcUrl });
    } catch {
      const TronWebModule = await import('npm:tronweb@5.4.0');
      const TronWebClass = TronWebModule.default || TronWebModule;
      tronWeb = new TronWebClass({ fullHost: rpcUrl });
    }

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

/**
 * POST /transaction/swap/tron
 * TRON JustSwap 스왑 실행 (위의 endpoint 라우팅으로 처리됨)
 */
// 제거됨 - handleSwapTron 함수로 통합됨

export default transactionRouter;
