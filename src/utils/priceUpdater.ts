/**
 * 코인 가격 자동 업데이트 시스템
 * supported_tokens 테이블의 price_usd와 price_krw를 주기적으로 업데이트
 */

import { supabase } from './supabase/client';
import { getUsdToKrwRate } from './exchangeRate';

interface CoinPrice {
  symbol: string;
  priceUsd: number;
  priceKrw: number;
}

// CoinGecko API (무료, API Key 불필요)
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// 코인 심볼 → CoinGecko ID 매핑
const COIN_GECKO_IDS: { [key: string]: string } = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'USDT-TRC20': 'tether', // USDT-TRC20은 USDT와 동일 가격
  'USDC': 'usd-coin',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'SOL': 'solana',
  'TRX': 'tron',
  'MATIC': 'matic-network',
  'DOT': 'polkadot',
  'LTC': 'litecoin',
  'SHIB': 'shiba-inu',
  'AVAX': 'avalanche-2',
  'WBTC': 'wrapped-bitcoin',
  'DAI': 'dai',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'TON': 'the-open-network',
  'XLM': 'stellar',
  'BCH': 'bitcoin-cash',
  'ETC': 'ethereum-classic',
  'NEAR': 'near',
  'ALGO': 'algorand',
  'VET': 'vechain',
  'FIL': 'filecoin',
  'ICP': 'internet-computer',
  'APT': 'aptos',
  'HBAR': 'hedera-hashgraph',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'KRWQ': 'tether' // KRWQ는 USDT와 동일하게 처리 (1:1 페깅)
};

// 커스텀 토큰 기본 가격 (USD)
const CUSTOM_TOKEN_PRICES: { [key: string]: number } = {
  'TOKEN': 1.0, // 테스트 토큰, $1로 고정
  'KRWQ': 1.0,  // KRWQ 기본값 (CoinGecko에서 가져올 수 없는 경우)
};

/**
 * CoinGecko에서 여러 코인의 USD 가격 가져오기
 */
async function fetchCoinPricesFromCoinGecko(symbols: string[]): Promise<Map<string, number>> {
  try {
    // 심볼을 CoinGecko ID로 변환
    const coinIds = symbols
      .map(symbol => COIN_GECKO_IDS[symbol])
      .filter(id => id !== undefined);

    if (coinIds.length === 0) {
      console.warn('No valid coin IDs found');
      return new Map();
    }

    // CoinGecko API 호출 (한 번에 여러 코인 조회)
    const idsParam = coinIds.join(',');
    const url = `${COINGECKO_API}/simple/price?ids=${idsParam}&vs_currencies=usd`;
    
    console.log('🔄 Fetching prices from CoinGecko:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      mode: 'cors'
    });
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    
    // CoinGecko ID → 심볼로 역변환하여 Map 생성
    const priceMap = new Map<string, number>();
    
    Object.entries(COIN_GECKO_IDS).forEach(([symbol, coinId]) => {
      if (data[coinId] && data[coinId].usd) {
        priceMap.set(symbol, data[coinId].usd);
      }
    });

    console.log(`✅ Fetched ${priceMap.size} coin prices from CoinGecko`);
    return priceMap;
    
  } catch (error) {
    console.error('❌ Failed to fetch prices from CoinGecko:', error);
    
    // CORS 오류나 네트워크 오류 시 기본값 반환
    console.log('💡 Using fallback prices from CUSTOM_TOKEN_PRICES');
    const fallbackMap = new Map<string, number>();
    
    // 모든 심볼에 대해 커스텀 가격 또는 1.0 반환
    symbols.forEach(symbol => {
      const price = CUSTOM_TOKEN_PRICES[symbol] || 1.0;
      fallbackMap.set(symbol, price);
    });
    
    return fallbackMap;
  }
}

/**
 * supported_tokens 테이블의 모든 활성 코인 가격 업데이트
 */
export async function updateAllCoinPrices(): Promise<{ success: boolean; updated: number; errors: string[] }> {
  console.log('🔄 Starting coin price update...');
  
  try {
    // 1. USD to KRW 환율 가져오기
    const exchangeRate = await getUsdToKrwRate();
    console.log(`💱 Current exchange rate: ${exchangeRate} KRW/USD`);

    // 2. DB에서 활성 코인 목록 가져오기
    const { data: coins, error: fetchError } = await supabase
      .from('supported_tokens')
      .select('symbol, is_active')
      .eq('is_active', true);

    if (fetchError) {
      console.error('❌ Failed to fetch coins from DB:', fetchError);
      return { success: false, updated: 0, errors: [fetchError.message] };
    }

    if (!coins || coins.length === 0) {
      console.warn('⚠️ No active coins found in database');
      return { success: true, updated: 0, errors: [] };
    }

    const symbols = coins.map(c => c.symbol);
    console.log(`📊 Updating prices for ${symbols.length} coins:`, symbols.join(', '));

    // 3. CoinGecko에서 가격 가져오기
    const priceMap = await fetchCoinPricesFromCoinGecko(symbols);

    if (priceMap.size === 0) {
      console.error('❌ No prices fetched from CoinGecko');
      return { success: false, updated: 0, errors: ['No prices fetched'] };
    }

    // 4. 각 코인 업데이트
    let updated = 0;
    const errors: string[] = [];

    for (const coin of coins) {
      // CoinGecko에서 가격 찾기, 없으면 커스텀 가격 사용
      let priceUsd = priceMap.get(coin.symbol);
      
      if (!priceUsd && CUSTOM_TOKEN_PRICES[coin.symbol]) {
        priceUsd = CUSTOM_TOKEN_PRICES[coin.symbol];
        console.log(`💡 Using custom price for ${coin.symbol}: $${priceUsd}`);
      }
      
      if (!priceUsd) {
        console.warn(`⚠️ No price found for ${coin.symbol} (not in CoinGecko or custom prices)`);
        errors.push(`No price for ${coin.symbol}`);
        continue;
      }

      const priceKrw = priceUsd * exchangeRate;

      // DB 업데이트
      const { error: updateError } = await supabase
        .from('supported_tokens')
        .update({
          price_usd: priceUsd,
          price_krw: priceKrw,
          updated_at: new Date().toISOString()
        })
        .eq('symbol', coin.symbol);

      if (updateError) {
        console.error(`❌ Failed to update ${coin.symbol}:`, updateError);
        errors.push(`${coin.symbol}: ${updateError.message}`);
      } else {
        console.log(`✅ Updated ${coin.symbol}: $${priceUsd.toFixed(2)} / ₩${priceKrw.toFixed(0)}`);
        updated++;
      }
    }

    console.log(`✅ Price update completed: ${updated}/${coins.length} coins updated`);
    
    return {
      success: errors.length < coins.length,
      updated,
      errors
    };

  } catch (error) {
    console.error('❌ Price update failed:', error);
    return {
      success: false,
      updated: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * 특정 코인의 가격만 업데이트
 */
export async function updateCoinPrice(symbol: string): Promise<{ success: boolean; priceUsd?: number; priceKrw?: number }> {
  try {
    const exchangeRate = await getUsdToKrwRate();
    const priceMap = await fetchCoinPricesFromCoinGecko([symbol]);
    
    const priceUsd = priceMap.get(symbol) || CUSTOM_TOKEN_PRICES[symbol];
    if (!priceUsd) {
      return { success: false };
    }

    const priceKrw = priceUsd * exchangeRate;

    const { error } = await supabase
      .from('supported_tokens')
      .update({
        price_usd: priceUsd,
        price_krw: priceKrw,
        updated_at: new Date().toISOString()
      })
      .eq('symbol', symbol);

    if (error) {
      console.error(`Failed to update ${symbol}:`, error);
      return { success: false };
    }

    return { success: true, priceUsd, priceKrw };
  } catch (error) {
    console.error('Update coin price error:', error);
    return { success: false };
  }
}

/**
 * 자동 가격 업데이트 시작 (10분마다)
 */
export function startPriceUpdateService(intervalMinutes: number = 10): () => void {
  console.log(`🚀 Starting price update service (every ${intervalMinutes} minutes)`);
  
  // 즉시 첫 업데이트 실행
  updateAllCoinPrices();

  // 주기적 업데이트 설정
  const intervalMs = intervalMinutes * 60 * 1000;
  const intervalId = setInterval(() => {
    updateAllCoinPrices();
  }, intervalMs);

  // 정지 함수 반환
  return () => {
    console.log('🛑 Stopping price update service');
    clearInterval(intervalId);
  };
}

/**
 * 코인 가격 조회 (캐시된 DB 값)
 */
export async function getCoinPrice(symbol: string): Promise<{ priceUsd: number; priceKrw: number } | null> {
  try {
    const { data, error } = await supabase
      .from('supported_tokens')
      .select('price_usd, price_krw')
      .eq('symbol', symbol)
      .single();

    if (error || !data) {
      console.error(`Failed to get price for ${symbol}:`, error);
      return null;
    }

    return {
      priceUsd: Number(data.price_usd || 0),
      priceKrw: Number(data.price_krw || 0)
    };
  } catch (error) {
    console.error('Get coin price error:', error);
    return null;
  }
}

/**
 * 모든 코인 가격 조회
 */
export async function getAllCoinPrices(): Promise<Map<string, { priceUsd: number; priceKrw: number }>> {
  try {
    const { data, error } = await supabase
      .from('supported_tokens')
      .select('symbol, price_usd, price_krw')
      .eq('is_active', true);

    if (error || !data) {
      console.error('Failed to get all coin prices:', error);
      return new Map();
    }

    const priceMap = new Map<string, { priceUsd: number; priceKrw: number }>();
    data.forEach((coin: any) => {
      priceMap.set(coin.symbol, {
        priceUsd: Number(coin.price_usd || 0),
        priceKrw: Number(coin.price_krw || 0)
      });
    });

    return priceMap;
  } catch (error) {
    console.error('Get all coin prices error:', error);
    return new Map();
  }
}